# 代码示例文档

## Python 示例

### 基础语法

```python
# 变量和数据类型
name = "张三"
age = 25
height = 1.75
is_student = True

# 列表
fruits = ["苹果", "香蕉", "橙子"]
fruits.append("葡萄")

# 字典
person = {
    "name": "李四",
    "age": 30,
    "city": "北京"
}

# 函数
def greet(name):
    return f"你好，{name}！"

# 类
class Student:
    def __init__(self, name, age):
        self.name = name
        self.age = age
    
    def introduce(self):
        return f"我是{self.name}，今年{self.age}岁。"

# 条件语句
if age >= 18:
    print("成年人")
else:
    print("未成年人")

# 循环
for fruit in fruits:
    print(fruit)

# 列表推导式
squares = [x**2 for x in range(10)]
```

## JavaScript 示例

### ES6+ 语法

```javascript
// 变量声明
const name = "张三";
let age = 25;

// 箭头函数
const greet = (name) => `你好，${name}！`;

// 解构赋值
const person = { name: "李四", age: 30, city: "北京" };
const { name: personName, age: personAge } = person;

// 数组方法
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
const evens = numbers.filter(n => n % 2 === 0);
const sum = numbers.reduce((acc, n) => acc + n, 0);

// Promise
const fetchData = () => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve("数据加载完成");
        }, 1000);
    });
};

// async/await
async function loadData() {
    try {
        const data = await fetchData();
        console.log(data);
    } catch (error) {
        console.error(error);
    }
}

// 类
class Rectangle {
    constructor(width, height) {
        this.width = width;
        this.height = height;
    }
    
    get area() {
        return this.width * this.height;
    }
}
```

## SQL 示例

### 数据库操作

```sql
-- 创建表
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE,
    age INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入数据
INSERT INTO users (name, email, age) 
VALUES ('张三', 'zhangsan@example.com', 25);

-- 查询数据
SELECT * FROM users WHERE age >= 18;

-- 更新数据
UPDATE users SET age = 26 WHERE name = '张三';

-- 删除数据
DELETE FROM users WHERE id = 1;

-- 联表查询
SELECT u.name, o.order_id, o.total
FROM users u
INNER JOIN orders o ON u.id = o.user_id
WHERE o.total > 100;
```

## Go 示例

### 基础语法

```go
package main

import "fmt"

// 结构体
type Person struct {
    Name string
    Age  int
}

// 方法
func (p Person) Greet() string {
    return fmt.Sprintf("你好，我是%s", p.Name)
}

// 接口
type Greeter interface {
    Greet() string
}

// 函数
func add(a, b int) int {
    return a + b
}

// goroutine
func main() {
    // 变量声明
    var name string = "张三"
    age := 25
    
    // 切片
    numbers := []int{1, 2, 3, 4, 5}
    
    // 映射
    person := map[string]interface{}{
        "name": "李四",
        "age":  30,
    }
    
    // 条件语句
    if age >= 18 {
        fmt.Println("成年人")
    }
    
    // 循环
    for i, num := range numbers {
        fmt.Printf("Index: %d, Value: %d\n", i, num)
    }
    
    // 并发
    go func() {
        fmt.Println("Hello from goroutine")
    }()
}
```
