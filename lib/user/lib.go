package user

// DynamoDB record compatible UserInfo
type UserInfoDDB struct {
	UserInfo
	Sort string `dynamo:"sort"`
}

type UserInfo struct {
	ID          string `json:"id" dynamo:"id"`
	Name        string `json:"name" dynamo:"name"`
	Picture     string `json:"picture" dynamo:"picture"`
	DisplayName string `json:"display_name" dynamo:"display_name"`
}

func (userInfo UserInfo) ToDDB() UserInfoDDB {
	return UserInfoDDB{
		UserInfo: userInfo,
		Sort:     "detail",
	}
}
