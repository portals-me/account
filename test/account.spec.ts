import axios from "axios";
import AWS from "aws-sdk";
const bcrypt = require("bcrypt");
const uuid = require("uuid/v4");

AWS.config.update({
  region: "ap-northeast-1"
});

const env: {
  restApi: string;
  tableName: string;
} = JSON.parse(process.env.ENV);

const Dynamo = new AWS.DynamoDB.DocumentClient();

const user = {
  id: uuid(),
  name: `admin-${uuid()}`,
  password: uuid()
};

beforeAll(async () => {
  await Dynamo.put({
    Item: {
      id: user.id,
      sort: "detail",
      name: user.name,
      picture: "picture url",
      display_name: "admin user"
    },
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
});

describe("Account", () => {
  it("should signin with password", async () => {
    const result = await axios.post(`${env.restApi}/signin`, {
      auth_type: "password",
      data: {
        user_name: user.name,
        password: user.password
      }
    });
    expect(result.data).toBeTruthy();
  });
});
