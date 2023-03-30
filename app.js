const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializingDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Db Error: ${error.message}`);
    process.exit(1);
  }
};
initializingDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkingUserQuery = `
    SELECT 
    *
    FROM 
    user
    WHERE 
    username = "${username}";`;
  const userDetails = await db.get(checkingUserQuery);

  if (userDetails !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      let encryptedPassword = await bcrypt.hash(password, 10);
      const registerUserQuery = `
            INSERT INTO 
            user (name, username, password, gender)
            VALUES 
            ("${name}", "${username}", "${encryptedPassword}", "${gender}");`;
      await db.run(registerUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkingForUserQuery = `
    SELECT 
    * 
    FROM 
    user 
    WHERE 
    username = "${username}";`;
  const userDetails = await db.get(checkingForUserQuery);

  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let comparingPassword = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (comparingPassword === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      let payload = { username: username };
      let jwtToken = jwt.sign(payload, "secret_key");
      response.send({ jwtToken });
    }
  }
});

const authenticateUser = (request, response, next) => {
  const requestHeaders = request.headers["authorization"];
  let jwtToken;
  if (requestHeaders !== undefined) {
    jwtToken = requestHeaders.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret_key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateUser, async (request, response) => {
  const { username } = request;
  const gettingUserDetails = `
    SELECT 
    *
    FROM 
    user 
    WHERE 
    username = "${username}";`;
  const userDetails = await db.get(gettingUserDetails);
  const gettingTweetsQuery = `
  SELECT 
  user.username,
  tweet.tweet,
  date_time AS dateTime
  FROM 
  follower INNER JOIN tweet
  ON follower.following_user_id = tweet.user_id
  INNER JOIN user 
  ON user.user_id = tweet.user_id
  WHERE 
  follower.follower_user_id = "${userDetails.user_id}"
  ORDER BY 
  tweet.date_time DESC
  LIMIT 4
  OFFSET 0;`;
  const dbResponse = await db.all(gettingTweetsQuery);
  response.send(dbResponse);
});

app.get("/user/following/", authenticateUser, async (request, response) => {
  const { username } = request;
  const gettingUserDetailsQuery = `
    SELECT 
    *
    FROM 
    user 
    WHERE 
    username = "${username}";`;
  const userDetails = await db.get(gettingUserDetailsQuery);
  const gettingFollowingUsersQuery = `
  SELECT 
  user.name
  FROM user INNER JOIN 
  follower ON "${userDetails.user_id}" = follower.follower_user_id
  WHERE 
  follower.following_user_id = user.user_id;`;
  const followingUserDetails = await db.all(gettingFollowingUsersQuery);
  response.send(followingUserDetails);
});

app.get("/user/followers/", authenticateUser, async (request, response) => {
  const { username } = request;
  const gettingUserDetailsQuery = `
    SELECT 
    *
    FROM 
    user 
    WHERE 
    username = "${username}";`;
  const userDetails = await db.get(gettingUserDetailsQuery);
  const gettingFollowerUsersQuery = `
  SELECT 
  user.name
  FROM user INNER JOIN 
  follower ON "${userDetails.user_id}" = follower.following_user_id
  WHERE 
  follower.follower_user_id = user.user_id;`;
  const followingUserDetails = await db.all(gettingFollowerUsersQuery);
  response.send(followingUserDetails);
});

app.get("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const gettingUserDetailsQuery = `
        SELECT 
        *
        FROM 
        user 
        WHERE 
        username = "${username}";`;
  const userDetails = await db.get(gettingUserDetailsQuery);
  const gettingTweetIdQuery = `
  SELECT 
  tweet.tweet_id
  FROM 
  follower INNER JOIN tweet ON 
  follower.following_user_id = tweet.user_id
  INNER JOIN user ON
  tweet.user_id = user.user_id
  WHERE 
  tweet.tweet_id = "${tweetId}" AND 
  follower.follower_user_id = "${userDetails.user_id}";`;
  const tweetsIdDetails = await db.get(gettingTweetIdQuery);
  if (tweetsIdDetails === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const gettingTotalLikes = `
      SELECT 
      tweet.tweet,
      COUNT(like.like_id) AS likes,
      tweet.date_time AS dateTime
      FROM 
      tweet INNER JOIN like ON 
      tweet.tweet_id = like.tweet_id
      WHERE 
      tweet.tweet_id = "${tweetId}";`;
    const tweetLikesCount = await db.get(gettingTotalLikes);
    const gettingReplies = `
      SELECT 
      tweet.tweet,
      COUNT(reply.reply_id) AS replies,
      tweet.date_time AS dateTime
      FROM 
      tweet
      INNER JOIN reply ON 
      tweet.tweet_id = reply.tweet_id
      WHERE 
      tweet.tweet_id = "${tweetId}";`;
    const tweetRepliesCount = await db.get(gettingReplies);
    const totalLikesAndReplies = {
      tweet: tweetLikesCount.tweet,
      likes: tweetLikesCount.likes,
      replies: tweetRepliesCount.replies,
      dateTime: tweetLikesCount.dateTime,
    };
    response.send(totalLikesAndReplies);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const gettingUserDetailsQuery = `
        SELECT 
        *
        FROM 
        user 
        WHERE 
        username = "${username}";`;
    const userDetails = await db.get(gettingUserDetailsQuery);
    const gettingTweetIdQuery = `
  SELECT 
  tweet.tweet_id
  FROM 
  follower INNER JOIN tweet ON 
  follower.following_user_id = tweet.user_id
  INNER JOIN user ON
  tweet.user_id = user.user_id
  WHERE 
  tweet.tweet_id = "${tweetId}" AND 
  follower.follower_user_id = "${userDetails.user_id}";`;
    const tweetsIdDetails = await db.get(gettingTweetIdQuery);
    if (tweetsIdDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const gettingUserNamesOfLikes = `
      SELECT 
      user.username
      FROM 
      tweet INNER JOIN like ON 
      tweet.tweet_id = like.tweet_id
      INNER JOIN user ON 
      like.user_id = user.user_id
      WHERE 
      tweet.tweet_id = "${tweetId}";`;
      const tweetLikesAndRepliesCount = await db.all(gettingUserNamesOfLikes);
      let likesList = [];
      for (let eachObject of tweetLikesAndRepliesCount) {
        likesList.push(eachObject.username);
      }
      response.send({ likes: likesList });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const gettingUserDetailsQuery = `
        SELECT 
        *
        FROM 
        user 
        WHERE 
        username = "${username}";`;
    const userDetails = await db.get(gettingUserDetailsQuery);
    const gettingTweetIdQuery = `
  SELECT 
  tweet.tweet_id
  FROM 
  follower INNER JOIN tweet ON 
  follower.following_user_id = tweet.user_id
  INNER JOIN user ON
  tweet.user_id = user.user_id
  WHERE 
  follower.follower_user_id = "${userDetails.user_id}" 
  AND tweet.tweet_id = "${tweetId}";`;
    const tweetsIdDetails = await db.get(gettingTweetIdQuery);
    if (tweetsIdDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const gettingUserNamesOfReplies = `
      SELECT 
      user.name,
      reply.reply
      FROM 
      tweet INNER JOIN reply ON 
      tweet.tweet_id = reply.tweet_id
      INNER JOIN user ON 
      reply.user_id = user.user_id
      WHERE 
      tweet.tweet_id = "${tweetId}";`;
      const tweetReplies = await db.all(gettingUserNamesOfReplies);
      let repliesList = [];
      for (let eachObject of tweetReplies) {
        repliesList.push(eachObject);
      }
      response.send({ replies: repliesList });
    }
  }
);

app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const gettingUserDetailsQuery = `
        SELECT 
        *
        FROM 
        user 
        WHERE 
        username = "${username}";`;
  const userDetails = await db.get(gettingUserDetailsQuery);
  const gettingTweetQuery = `
  SELECT 
  tweet,
  (SELECT 
    COUNT(like_id) 
    FROM like
    WHERE 
    tweet_id = tweet.tweet_id) AS likes,
    (SELECT 
    COUNT(reply_id) 
    FROM reply
    WHERE 
    tweet_id = tweet.tweet_id) AS replies,
    date_time AS dateTime 
    FROM tweet
    WHERE 
    user_id = ${userDetails.user_id}`;
  const tweetsDetails = await db.all(gettingTweetQuery);
  response.send(tweetsDetails);
});

app.post("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const gettingUserDetailsQuery = `
        SELECT 
        *
        FROM 
        user 
        WHERE 
        username = "${username}";`;
  const userDetails = await db.get(gettingUserDetailsQuery);
  const creatingTweetQuery = `
  INSERT INTO 
  tweet (tweet, user_id)
  VALUES 
  ("${tweet}", "${userDetails.user_id}");`;
  await db.run(creatingTweetQuery);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const gettingUserDetailsQuery = `
        SELECT 
        *
        FROM 
        user 
        WHERE 
        username = "${username}";`;
  const userDetails = await db.get(gettingUserDetailsQuery);
  const gettingUserTweets = `
  SELECT 
  tweet.user_id
  FROM 
  tweet 
  WHERE  
  tweet.tweet_id = "${tweetId}";`;
  const userTweets = await db.get(gettingUserTweets);
  if (userTweets.user_id !== userDetails.user_id) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deletingTweet = `
      DELETE FROM 
      tweet 
      WHERE 
      tweet.tweet_id = "${tweetId}";`;
    await db.run(deletingTweet);
    response.send("Tweet Removed");
  }
});

module.exports = app;
