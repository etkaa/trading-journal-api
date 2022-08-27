require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");

const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const findOrCreate = require("mongoose-findorcreate");

const cors = require("cors");
const port = 8000;

const app = express();
app.use(cors());

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(bodyParser.json());

app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.DB_URL, { useNewUrlParser: true }, () => {
  console.log("Connected to DB");
});

const tradeSchema = new mongoose.Schema({
  pair: String,
  date: String,
  time: String,
  open: String,
  close: String,
  volume: String,
  outcome: String,
  riskReward: String,
  pAndL: String,
});

const Trade = new mongoose.model("Trade", tradeSchema);

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  password: String,
  googleId: String,
  auth_method: String,
  userTrades: [
    {
      tradeSchema,
      // pair: String,
      // date: String,
      // time: String,
      // open: String,
      // close: String,
      // volume: String,
      // outcome: String,
      // riskReward: String,
      // pAndL: String,
    },
  ],
  profile: {
    initialBalance: String,
    brokerName: String,
    profileImageUrl: String,
  },
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//       callbackURL: "http://localhost:3000/auth/google/secrets",
//       userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
//     },
//     function (accessToken, refreshToken, profile, cb) {
//       User.findOrCreate(
//         { googleId: profile.id },
//         { username: profile._json.email },
//         { auth_method: "google" },
//         function (err, user) {
//           return cb(err, user);
//         }
//       );
//     }
//   )
// );

app.get("/auth/logout", (req, res) => {
  req.logout((err) => {
    if (!err) {
      res.send({ success: true });
    } else {
      console.log(err);
    }
  });
});

app.post("/auth/signup", (req, res) => {
  User.register(
    {
      fullName: req.body.fullName,
      username: req.body.username,
      auth_method: "local",
      userTrades: [],
      profile: {
        initialBalance: "",
        brokerName: "",
        profileImageUrl: "",
      },
    },
    req.body.password,
    (err, user) => {
      if (!err) {
        passport.authenticate("local")(req, res, () => {
          res.status(200).send({ user: user, success: true });
        });
      } else {
        const errorMessage = err.message;
        res.status(500).send({
          message: errorMessage,
        });
      }
    }
  );
});

app.post("/auth/signin", (req, res) => {
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });

  req.login(user, (err) => {
    if (!err) {
      passport.authenticate("local", {
        failureMessage: true,
        refreshToken: true,
      })(req, res, () => {
        res.send({
          success: true,
          user: req.user,
        });
      });
    } else {
      const message = err.message;
      console.log(message);
      res.send({
        statusCode: 500,
        message: message,
      });
    }
  });
});

app.post("/user/update/profile", (req, res) => {
  const { userID, fullName, email, initialBalance, brokerName } = req.body;
  User.findByIdAndUpdate(
    userID,
    {
      fullName: fullName,
      email: email,
      "profile.initialBalance": initialBalance,
      "profile.brokerName": brokerName,
    },
    function (err, newUser) {
      if (!err) {
        res.status(200).send(newUser);
      } else {
        console.log(err);
      }
    }
  );
});

app.post("/user/update/trades", (req, res) => {
  const { userID, newTrade } = req.body;
  //create new trade
  const userAddedTrade = new Trade({
    pair: newTrade.pair,
    date: newTrade.date,
    time: newTrade.time,
    open: newTrade.open,
    close: newTrade.close,
    volume: newTrade.volume,
    outcome: newTrade.outcome,
    riskReward: newTrade.riskReward,
    pAndL: newTrade.pAndL,
  });
  
  //save the id of that trade into the user's array

  userAddedTrade.save((err, _id) => {
    User.findByIdAndUpdate(
      userID,
      { $push: { userTrades: _id } },
      function (err, docs) {
        if (!err) {
          console.log("operation success, this is the docs", docs);
        } else {
          console.log("@@@@houston, we've got a problem: ", err);
        }
      }
    );
  });

});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
