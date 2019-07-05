import * as devkit from "swagger-devkit";

const swagger = new devkit.Swagger();

swagger.addInfo({
  title: "Account Service API Spec",
  version: "1.0.0"
});

const userSchema = {
  id: devkit.Schema.string({
    format: "uuid"
  }),
  name: devkit.Schema.string({
    description: "So called `screen_name`, this must be unique among all users"
  }),
  picture: devkit.Schema.string({
    format: "url",
    description: "URL for the avatar image"
  }),
  display_name: devkit.Schema.string({
    description: "The name for profile"
  })
};

const authSchema = {
  auth_type: {
    enum: ["password", "twitter", "google"],
    type: "string"
  },
  data: {
    oneOf: [
      devkit.Schema.object(
        {
          user_name: devkit.Schema.string(),
          password: devkit.Schema.string()
        },
        {
          description: "Valid when auth_type is `password`"
        }
      ),
      devkit.Schema.object(
        {
          credential_token: devkit.Schema.string(),
          credential_secret: devkit.Schema.string()
        },
        {
          description: "Valid when auth_type is `twitter`"
        }
      ),
      devkit.Schema.object(
        {
          token: devkit.Schema.string({
            description: "Google id token"
          })
        },
        {
          description: "Valid when auth_type is `google`"
        }
      )
    ]
  }
};

const SignInInput = new devkit.Component(
  swagger,
  "SignInInput",
  devkit.Schema.object({
    auth_type: authSchema.auth_type,
    data: authSchema.data
  })
);

swagger.addPath(
  "/signin",
  "post",
  new devkit.Path({
    summary: "SignIn with existing account",
    tags: ["auth"]
  })
    .addRequestBody(
      new devkit.RequestBody().addContent("application/json", SignInInput)
    )
    .addResponse(
      "200",
      new devkit.Response({
        description: "JWT Successfully created"
      }).addContent(
        "application/json",
        devkit.Schema.string({
          description: "JWT created by portals-me.com"
        })
      )
    )
);

const { id, ...SignUpInputUser } = userSchema;
const SignUpInput = new devkit.Component(
  swagger,
  "SignUpInput",
  devkit.Schema.object({
    user: devkit.Schema.object({
      ...SignUpInputUser
    }),
    ...authSchema
  })
);

swagger.addPath(
  "/signup",
  "post",
  new devkit.Path({
    summary: "SignUp with user data",
    tags: ["auth"]
  })
    .addRequestBody(
      new devkit.RequestBody().addContent("application/json", SignUpInput)
    )
    .addResponse(
      "200",
      new devkit.Response({
        description: "JWT Successfully created"
      }).addContent(
        "application/json",
        devkit.Schema.string({
          description: "JWT created by portals-me.com"
        })
      )
    )
);

swagger.addPath(
  "/username/{name}",
  "get",
  new devkit.Path({
    summary: "Get the user by name",
    tags: ["auth"],
    parameters: [
      {
        in: "path",
        required: true,
        name: "name",
        schema: devkit.Schema.string()
      }
    ]
  }).addResponse(
    "200",
    new devkit.Response({
      description: "Returns User record"
    }).addContent(
      "application/json",
      devkit.Schema.object({
        id: devkit.Schema.string({
          format: "uuid"
        }),
        name: devkit.Schema.string()
      })
    )
  )
);

const User = new devkit.Component(
  swagger,
  "User",
  devkit.Schema.object({
    ...userSchema
  })
);

swagger.addPath(
  "/users/{userId}",
  "get",
  new devkit.Path({
    summary: "Get the user by id",
    tags: ["auth"],
    parameters: [
      {
        in: "path",
        required: true,
        name: "userId",
        schema: devkit.Schema.string({
          format: "uuid"
        })
      }
    ]
  }).addResponse(
    "200",
    new devkit.Response({
      description: "Returns User record"
    }).addContent("application/json", User)
  )
);

swagger.addPath(
  "/users/{userId}",
  "put",
  new devkit.Path({
    summary: "Update the user",
    tags: ["auth"],
    parameters: [
      {
        in: "path",
        required: true,
        name: "userId",
        schema: devkit.Schema.string({
          format: "uuid"
        })
      }
    ]
  })
    .addRequestBody(
      new devkit.RequestBody().addContent(
        "application/json",
        devkit.Schema.object({
          ...SignUpInputUser
        })
      )
    )
    .addResponse(
      "204",
      new devkit.Response({
        description: "No Content"
      })
    )
);

swagger.addPath(
  "/twitter",
  "post",
  new devkit.Path({
    summary: "URL for Twitter callback",
    description: "This URL should be used for Twitter callback",
    tags: ["twitter"]
  }).addResponse(
    "200",
    new devkit.Response({
      description: "Returns redirect URL"
    }).addContent(
      "application/json",
      devkit.Schema.string({
        format: "url",
        description: "URL for redirection"
      })
    )
  )
);

swagger.addPath(
  "/twitter",
  "get",
  new devkit.Path({
    summary: "Get Twitter credentials",
    tags: ["twitter"]
  }).addResponse(
    "200",
    new devkit.Response({
      description: "Returns Twitter credentials and account information"
    }).addContent(
      "application/json",
      devkit.Schema.object({
        credential_token: devkit.Schema.string(),
        credential_secret: devkit.Schema.string(),
        account: devkit.Schema.object(
          {
            id_str: devkit.Schema.string(),
            screen_name: devkit.Schema.string(),
            name: devkit.Schema.string({
              description: "display_name"
            }),
            profile_image_url: devkit.Schema.string({
              format: "url"
            })
          },
          {
            description: "Twitter user information"
          }
        )
      })
    )
  )
);

swagger.run();
