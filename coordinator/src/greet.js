function greetUser(name) {
  const greeting = name ? `Hello, ${name}!` : 'Hello, User!';
  console.log(greeting);
  return greeting;
}

module.exports = { greetUser };
