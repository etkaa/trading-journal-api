require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");

const session = require("express-session");
const cookieParser = require("cookie-parser");
const MemoryStore = require("memorystore")(session);
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

const cors = require("cors");
const app = express();

app.set("trust proxy", 1);

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(bodyParser.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SECRET,
    saveUninitialized: false,
    resave: true, //this was the original, trying if this causes cookie to change on signup
    // resave: false,
    store: new MemoryStore({
      checkPeriod: 18000000, // prune expired entries every 5h
    }),
    cookie: {
      path: "/",
      maxAge: 1000 * 60 * 60 * 3, //3 Hours
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

mongoose.connect(process.env.DB_URL, { useNewUrlParser: true }, () => {
  console.log("Connected to DB");
});

const tradeSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
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
      String,
    },
  ],
  profile: {
    initialBalance: String,
    brokerName: String,
    profileImageUrl: String,
  },
});

userSchema.plugin(passportLocalMongoose);
// userSchema.plugin(findOrCreate);

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

function checkAuthentication(req, res, next) {
  if (req.isAuthenticated()) {
    next();
  } else {
    res.status(401).send();
  }
}

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

app.get("/", (req, res) => {
  res.status(200).send({
    message:
      "Hello, friend! I am not sure how you ended up here but, this is a private API for my portfolio project, so thanks for visiting!",
    link: "https://github.com/manfromny/trading-journal",
  });
});

app.get("/auth/status", checkAuthentication, (req, res) => {
  res.status(200).send({
    user: req.user.id,
  });
});

app.get("/auth/logout", (req, res) => {
  req.logout((err) => {
    if (!err) {
      res.status(200).send({ success: true });
    } else {
      res.status(500).send({ error: err });
    }
  });
});

app.get("/user/stats/:userID", checkAuthentication, (req, res) => {
  const userID = req.params.userID;
  //find all trades with the userID===userId
  Trade.find({ userId: userID }, (err, allTrades) => {
    if (!err) {
      var winLoss = Number(0);
      var winCount = Number(0);
      var sum = Number(0);
      var totalRiskReward = Number(0);
      var avgRiskReward = Number(0);
      var totalTradeCount = Number(0);
      var totalVolume = Number(0);
      for (i = 0; i < allTrades.length; i++) {
        sum = sum + parseInt(allTrades[i].pAndL);

        var status = allTrades[i].outcome;
        if (status === "Win") {
          winCount = winCount + 1;
        }
        winLoss = (winCount / allTrades.length) * 100;

        totalVolume = totalVolume + parseFloat(allTrades[i].volume);

        totalRiskReward = totalRiskReward + parseFloat(allTrades[i].riskReward);
        avgRiskReward = totalRiskReward / allTrades.length;
        totalTradeCount = allTrades.length;
      }
      res.status(200).send({
        userStats: {
          sumOfAllTrades: sum,
          winLossRatio: winLoss,
          averageRiskReward: avgRiskReward,
          totalTradeCount: totalTradeCount,
          totalVolume: totalVolume,
        },
      });
    } else {
      res.status(500).send({ error: err });
    }
  });
});

app.get("/user/trades/:userID", checkAuthentication, (req, res) => {
  const userID = req.params.userID;
  //find all trades with the userID===userId
  Trade.find({ userId: userID }, (err, docs) => {
    if (!err) {
      res.status(200).send({
        tradesOfUser: docs,
      });
    } else {
      res.status(500).send({
        error: err,
      });
    }
  });
});

app.get("/user/profile/:userID", checkAuthentication, (req, res) => {
  const userID = req.params.userID;
  //find the user where userID===userId
  User.findById(userID, (err, user) => {
    if (!err) {
      res.status(200).send({
        profileFields: {
          fullName: user.fullName,
          email: user.username,
          initialBalance: user.profile.initialBalance,
          brokerName: user.profile.brokerName,
          profileImageUrl: user.profile.profileImageUrl,
        },
      });
    } else {
      res.status(500).send({
        error: err,
      });
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
        passport.authenticate("local", {
          failureMessage: true,
        })(req, res, () => {
          res.status(200).send({
            userID: user._id,
          });
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

  req.logIn(user, (err) => {
    if (!err) {
      passport.authenticate("local", {
        failureMessage: true,
        refreshToken: true,
      })(req, res, () => {
        res.status(200).send({
          userID: req.user._id,
        });
      });
    } else {
      const errorMessage = err.message;
      res.status(500).send({
        message: errorMessage,
      });
    }
  });
});

app.post("/user/update/profile", checkAuthentication, (req, res) => {
  const {
    userID,
    fullName,
    email,
    initialBalance,
    brokerName,
    profileImageUrl,
  } = req.body;
  User.findByIdAndUpdate(
    userID,
    {
      fullName: fullName,
      email: email,
      "profile.initialBalance": initialBalance,
      "profile.brokerName": brokerName,
      "profile.profileImageUrl": profileImageUrl,
    },
    function (err, updatedUser) {
      if (!err) {
        res.status(200).send();
      } else {
        res.status(500).send({ error: err });
      }
    }
  );
});

app.post("/user/update/trades", checkAuthentication, (req, res) => {
  const { userID, newTrade } = req.body;
  //create new trade
  var newOutcome;
  if (newTrade.pAndL > 0) {
    newOutcome = "Win";
  } else if (newTrade.pAndL < 0) {
    newOutcome = "Lose";
  } else {
    newOutcome = "Break-Even";
  }

  const userAddedTrade = new Trade({
    userId: userID,
    pair: newTrade.pair,
    date: newTrade.date,
    time: newTrade.time,
    open: newTrade.open,
    close: newTrade.close,
    volume: newTrade.volume,
    outcome: newOutcome,
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
          res.status(200).send();
        } else {
          res.status(500).send({ error: err });
        }
      }
    );
  });
});

app.get("/user/trades/details/:tradeId", checkAuthentication, (req, res) => {
  const tradeId = req.params.tradeId;
  //find all trades with the userID===userId
  Trade.findById(tradeId, (err, foundTrade) => {
    if (!err) {
      res.status(200).send({
        requestedTrade: foundTrade,
      });
    } else {
      res.status(500).send({
        error: err,
      });
    }
  });
});

app.patch("/user/patch/trades/:tradeId", checkAuthentication, (req, res) => {
  const { updatedTrade } = req.body;
  const tradeId = req.params.tradeId;
  //create new trade
  var updatedOutcome;
  if (updatedTrade.pAndL > 0) {
    updatedOutcome = "Win";
  } else if (updatedTrade.pAndL < 0) {
    updatedOutcome = "Lose";
  } else {
    updatedOutcome = "Break-Even";
  }

  Trade.findByIdAndUpdate(
    tradeId,
    {
      pair: updatedTrade.pair,
      date: updatedTrade.date,
      time: updatedTrade.time,
      open: updatedTrade.open,
      close: updatedTrade.close,
      volume: updatedTrade.volume,
      outcome: updatedOutcome,
      riskReward: updatedTrade.riskReward,
      pAndL: updatedTrade.pAndL,
    },
    function (err, updatedTrade) {
      if (!err) {
        res.status(200).send({ message: "Successfully updated!" });
      } else {
        res.status(500).send({ error: err });
      }
    }
  );
});

app.delete("/user/trade/delete/:tradeId", checkAuthentication, (req, res) => {
  const tradeId = req.params.tradeId;

  Trade.findByIdAndDelete(tradeId, function (err, docs) {
    if (!err) {
      res.status(200).send({ message: "Successfully deleted!" });
    } else {
      res.status(500).send({ error: err });
    }
  });
});

app.listen(process.env.PORT || 8000, () => {
  console.log(`Server started running.`);
});
