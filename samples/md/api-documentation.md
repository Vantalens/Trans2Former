# 技术文档示例

## API 文档

### 用户接口

#### GET /api/users

获取用户列表。

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 10 |
| status | string | 否 | 用户状态：active/inactive |

**响应示例：**

```json
{
  "code": 200,
  "data": {
    "users": [...],
    "total": 100
  }
}
```

#### POST /api/users

创建新用户。

**请求体：**

```json
{
  "name": "张三",
  "email": "zhangsan@example.com",
  "age": 25
}
```

**响应：**

- 201: 创建成功
- 400: 参数错误
- 409: 用户已存在

### 认证接口

#### POST /api/auth/login

用户登录。

**请求体：**

```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

**响应：**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |
