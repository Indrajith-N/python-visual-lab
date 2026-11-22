export const EXAMPLES=[
{name:'1. Variables and addition',code:`a = 10
b = 20
c = a + b
print("Sum is", c)`},
{name:'2. Arithmetic operations',code:`x = 17
y = 5
print(x + y)
print(x - y)
print(x * y)
print(x / y)
print(x // y)
print(x % y)
print(x ** 2)`},
{name:'3. Even or odd (if-else)',code:`n = 7
if n % 2 == 0:
    print(n, "is even")
else:
    print(n, "is odd")`},
{name:'4. Multiplication table (for)',code:`n = 3
for i in range(1, 6):
    result = n * i
    print(n, "x", i, "=", result)`},
{name:'5. Sum of numbers (while)',code:`total = 0
i = 1
while i <= 5:
    total = total + i
    i = i + 1
print("Sum =", total)`},
{name:'6. Lists',code:`nums = [4, 8, 15]
nums.append(16)
nums[0] = 99
print(nums[2])
print(len(nums))
print(nums)`},
{name:'7. Grades (if-elif-else)',code:`marks = 72
if marks >= 90:
    print("A")
elif marks >= 70:
    print("B")
else:
    print("C")`},
{name:'8. Loop with break / continue',code:`for i in range(1, 8):
    if i == 3:
        continue
    if i == 6:
        break
    print(i)`},
{name:'9. Hello World',code:`print("Hello, World!")`},
{name:'10. Largest of three numbers',code:`a = 14
b = 27
c = 9
if a >= b and a >= c:
    largest = a
elif b >= c:
    largest = b
else:
    largest = c
print("Largest:", largest)`},
{name:'11. Factorial using a loop',code:`n = 5
fact = 1
for i in range(1, n + 1):
    fact = fact * i
print(n, "! =", fact)`},
{name:'12. Fibonacci series',code:`a, b = 0, 1
for i in range(8):
    print(a)
    a, b = b, a + b`},
{name:'13. Dictionary operations',code:`marks = {"maths": 80, "python": 92}
marks["physics"] = 75
marks["maths"] = 85
del marks["python"]
print(marks)
print(marks.get("physics"))
print(list(marks.keys()))`},
{name:'14. User-defined functions',code:`def area(w, h=2):
    return w * h

def greet(name):
    print("Hello,", name)

print(area(5))
print(area(5, h=4))
greet("Asha")`},
{name:'15. Recursion',code:`def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(4))`},
{name:'16. Nested loops',code:`for i in range(1, 4):
    for j in range(1, 4):
        print(i * j, end=" ")
    print()`},
{name:'17. Class and object',code:`class Dog:
    species = "Canis"
    def __init__(self, name):
        self.name = name
        self.tricks = []
    def learn(self, trick):
        self.tricks.append(trick)

d = Dog("Rex")
d.learn("sit")
print(d.name, d.tricks)`},
{name:'18. Exception handling',code:`def divide(a, b):
    return a / b

try:
    print(divide(10, 0))
except ZeroDivisionError as e:
    print("Caught:", e)
finally:
    print("Done")`},
{name:'19. Standard library import',code:`import math
r = 3
area = math.pi * r ** 2
print(round(area, 2))`}
];
