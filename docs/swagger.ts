import * as devkit from "swagger-devkit";

const swagger = new devkit.Swagger();

swagger.addInfo({
  title: "portals@me Account service API Spec",
  version: "1.0.0"
});

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
  devkit.Schema.object(authSchema)
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

const SignUpInput = new devkit.Component(
  swagger,
  "SignUpInput",
  devkit.Schema.object(
    Object.assign(authSchema, {
      user: devkit.Schema.object({
        name: devkit.Schema.string({
          description:
            "So called `screen_name`, this must be unique among all users"
        }),
        picture: devkit.Schema.string({
          format: "url",
          description: "URL for the avatar image"
        }),
        display_name: devkit.Schema.string({
          description: "The name for profile"
        })
      })
    })
  )
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
