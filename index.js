require("./utils.js");

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const Joi = require("joi");
// const url = require('url');
const saltRounds = 12;

const port = process.env.PORT || 4420;
const app = express();

const expireTime = 1 * 60 * 60 * 1000; //expires after 1 hour (hours * minutes * seconds * millis)

/* secret information */
const node_session_secret = process.env.NODE_SESSION_SECRET;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const mongodb_port = process.env.MONGODB_PORT;
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
/* secret information */

var { database } = include("./databaseConnection.js");
const userCollection = database.db(mongodb_database).collection("users");

var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/?retryWrites=true&w=majority`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore, //default is memory, but we want to use mongo
    saveUninitialized: false,
    resave: false,
  })
);

function isValidSession(req) {
  return req.session.authenticated;
}

function sessionValidation(req, res, next) {
  if (isValidSession(req)) {
    next();
  } else {
    res.redirect("/login");
  }
}

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: false }));

app.use(express.static(__dirname + "/public"));

app.get('/', (req, res) => {
    res.render("homepage", {
        user: req.session.username,
        authenticated: req.session.authenticated
    });
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/loginSubmit", async (req, res) => {
  var email = req.body.email;
  var password = req.body.password;

  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().max(20).required(),
  });

  const validationResult = schema.validate({ email, password });

  if (validationResult.error != null) {
    res.render("login-submit", {
      validationError: true,
      validationMessage: validationResult.error.message,
    });
    return;
  }

  const result = await userCollection
    .find({ email: email })
    .project({ email: 1, username: 1, password: 1, user_type: 1, _id: 1 })
    .toArray();

  if (result.length != 1) {
    res.render("login-submit", {
      validationError: false,
      userFound: false,
    });
    return;
  }

  if (await bcrypt.compare(password, result[0].password)) {
    req.session.authenticated = true;
    req.session.email = email;
    req.session.cookie.maxAge = expireTime;
    req.session.username = result[0].username;
    req.session.user_type = result[0].user_type;
    req.session.save(() => {
      res.redirect("/");
    });
    return;
  } else {
    res.render("login-submit", {
      validationError: false,
      userFound: true,
      correctPassword: false,
    });
    return;
  }
});

app.post("/signupSubmit", async (req, res) => {
  var username = req.body.username;
  var email = req.body.email;
  var password = req.body.password;

  const schema = Joi.object({
    username: Joi.string().alphanum().max(20).required(),
    email: Joi.string().email().required(),
    password: Joi.string().max(20).required(),
  });

  const validationResult = schema.validate({ username, email, password });
  if (validationResult.error != null) {
    res.render("signup-submit", {
      validationMessage: validationResult.error.message,
    });
    return;
  }

  const userAlreadyExists = await userCollection.findOne({
    $or: [{ username: username }, { email: email }],
  });

  if (userAlreadyExists) {
    if (userAlreadyExists.username == username) {
      res.render("signup-submit", {
        validationMessage: "Username is already taken!",
      });
    } else if (userAlreadyExists.email == email) {
      res.render("signup-submit", {
        validationMessage: "Email is already in use!",
      });
    }

    return;
  }

  var hashedPassword = await bcrypt.hash(password, saltRounds);

  await userCollection.insertOne({
    username: username,
    email: email,
    password: hashedPassword,
    user_type: "user",
  });

  req.session.authenticated = true;
  req.session.email = email;
  req.session.cookie.maxAge = expireTime;
  req.session.username = username;
  req.session.save(() => {
    res.redirect("/");
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("*", (req, res) => {
  res.status(404);
  res.render("404");
});
app.listen(port, () => {
  console.log(`Node application listening on port ${port}`);
});
