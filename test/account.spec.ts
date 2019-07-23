import axios from "axios";
import AWS from "aws-sdk";
const bcrypt = require("bcrypt");
const uuid = require("uuid/v4");
const genName = () => uuid().replace(/\-/g, "_");

AWS.config.update({
  region: "ap-northeast-1"
});

const env: {
  restApi: string;
  tableName: string;
  domain: string;
} = JSON.parse(process.env.ENV);

const Dynamo = new AWS.DynamoDB.DocumentClient();

const user = {
  id: uuid(),
  name: `admin_${genName()}`,
  password: uuid(),
  picture: `${env.domain}/avatar/admin`,
  display_name: "admin"
};

const guestUser = {
  id: uuid(),
  name: `guest_${genName()}`,
  password: uuid(),
  picture: `${env.domain}/avatar/guest`,
  display_name: "guest"
};

const createUser = async (user: {
  id: string;
  name: string;
  password: string;
  picture: string;
  display_name: string;
}) => {
  await Dynamo.put({
    Item: Object.assign(user, {
      sort: "detail"
    }),
    TableName: env.tableName
  }).promise();

  await Dynamo.put({
    Item: {
      id: user.id,
      sort: `name-pass##${user.name}`,
      check_data: bcrypt.hashSync(user.password, 10)
    },
    TableName: env.tableName
  }).promise();
};

const deleteUser = async (user: { id: string; name: string }) => {
  await Dynamo.delete({
    Key: {
      id: user.id,
      sort: "detail"
    },
    TableName: env.tableName
  }).promise();

  await Dynamo.delete({
    Key: {
      id: user.id,
      sort: `name-pass##${user.name}`
    },
    TableName: env.tableName
  }).promise();
};

beforeAll(async () => {
  await createUser(user);
  await createUser(guestUser);
});

afterAll(async () => {
  await deleteUser(user);
  await deleteUser(guestUser);
});

describe("Account", () => {
  let userJWT: string;

  it("should signin with password", async () => {
    const result = await axios.post(`${env.restApi}/signin`, {
      auth_type: "password",
      data: {
        user_name: user.name,
        password: user.password
      }
    });
    expect(result.data).toBeTruthy();

    userJWT = result.data;
  });

  it("should get the user id by name", async () => {
    const result = await axios.get(`${env.restApi}/username/${user.name}`);
    expect(result.data.id).toEqual(user.id);
    expect(result.data.name).toEqual(user.name);
  });

  it("should update user_name", async () => {
    const newName = genName();
    const result = await axios.put(
      `${env.restApi}/self`,
      {
        name: newName
      },
      {
        headers: {
          Authorization: userJWT
        }
      }
    );

    expect(result.status).toEqual(204);
  });

  it("should not update user_name less than 3 characters", async () => {
    await expect(
      axios.put(
        `${env.restApi}/self`,
        {
          name: "aa"
        },
        {
          headers: {
            Authorization: userJWT
          }
        }
      )
    ).rejects.toThrow("400");
  });

  it("should not update user_name which is not unique", async () => {
    await expect(
      axios.put(
        `${env.restApi}/self`,
        {
          name: guestUser.name
        },
        {
          headers: {
            Authorization: userJWT
          }
        }
      )
    ).rejects.toThrow("400");
  });

  it("should not update user_name which is invalid", async () => {
    await expect(
      axios.put(
        `${env.restApi}/self`,
        {
          name: "@aaa"
        },
        {
          headers: {
            Authorization: userJWT
          }
        }
      )
    ).rejects.toThrow("400");
  });

  it("should update the profile", async () => {
    const newName = genName();

    const result = await axios.put(
      `${env.restApi}/self`,
      {
        name: newName,
        picture: `${env.domain}/newnewnew`,
        display_name: "new display_name"
      },
      {
        headers: {
          Authorization: userJWT
        }
      }
    );

    expect(result.status).toEqual(204);
  });

  it("should not update the profile with invalid url", async () => {
    const newName = genName();

    expect(
      axios.put(
        `${env.restApi}/self`,
        {
          picture: "https://example.com/invalid_profile"
        },
        {
          headers: {
            Authorization: userJWT
          }
        }
      )
    ).rejects.toThrow("400");
  });

  it("should not update the profile using wrong JWT", async () => {
    const newName = genName();

    await expect(
      axios.put(
        `${env.restApi}/self`,
        {
          name: newName
        },
        {
          headers: {
            Authorization: "xxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxx"
          }
        }
      )
    ).rejects.toThrow("401");
  });
});
