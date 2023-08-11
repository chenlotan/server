const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const PORT = process.env.PORT || 3001;
const app = express();
app.enable("trust proxy");
app.use(express.json());
app.use(cors());
const query = require("./sqlQuery");
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
const shuf = require("lodash");
const auth = require("./auth");
const moment = require("moment-timezone");

/* handling of uploading a picture - START - DO NOT MODIFY IT */
const mult = require("multer");
const { Storage } = require("@google-cloud/storage");
const storage = new Storage();
const multer = mult({
  storage: mult.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const bucketName = "get-party-images-db";
const bucket = storage.bucket(bucketName);

app.post(
  "/uploadImageToCloud",
  multer.single("somefile"),
  function (req, res, next) {
    if (!req.file) {
      res.status(400).send("No file uploaded");
    }
    const blob = bucket.file(generateUniqueFilename(req.file.originalname));
    const blobStream = blob.createWriteStream();

    blobStream.on("error", (err) => {
      next(err);
    });

    blobStream.on("finish", () => {
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      res.status(200).json({ publicUrl });
    });
    blobStream.end(req.file.buffer);
  }
);

function generateUniqueFilename(filename) {
  const timestamp = Date.now();
  const uniqueSuffix = Math.floor(Math.random() * 1000);
  const fileExtension = filename.split(".").pop();
  return `${timestamp}-${uniqueSuffix}.${fileExtension}`;
}

async function uploadAllImages(files, isUserPhoto = false, isUpdate = false) {
  let publicUrls = [];
  if (!files || files.length === 0) {
    if (isUserPhoto === true) return [];
    if (isUpdate === true) return [];
    return ["https://storage.googleapis.com/get-party-images-db/default.jpg"];
  }

  const uploadPromises = files.map((file) => {
    return new Promise((resolve, reject) => {
      const blob = bucket.file(generateUniqueFilename(file.originalname));
      const blobStream = blob.createWriteStream();

      blobStream.on("error", (error) => {
        reject(error);
      });

      blobStream.on("finish", () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        resolve(publicUrl);
      });

      blobStream.end(file.buffer);
    });
  });

  await Promise.all(uploadPromises)
    .then((publicUrlsArray) => {
      publicUrls = publicUrlsArray;
    })
    .catch((error) => console.log(error));

  return publicUrls;
}
/* handling of uploading a picture - END */

/******************************************************************** TABLES APIs ********************************************************************/
/* Gets all the productions registerd on the website */
app.get("/getAllProductions", (req, res) => {
  query
    .getAllProductions()
    .then((results) => {
      const productionNames = results.map((production) => production.full_name);
      res.status(200).send(productionNames);
    })
    .catch((error) => {
      res
        .status(500)
        .send(
          "There was an error with fetching the list of all the productions" +
            error
        );
    });
});

/* Gets all the music types list */
app.get("/musicTypes", async (req, res) => {
  try {
    const musicTypes = query.musicTypes;
    const musicTypesList = musicTypes.types;
    res.status(200).send(musicTypesList);
  } catch (error) {
    res
      .status(500)
      .send(
        "There was an error with fetching the list of all the music types list",
        error
      );
  }
});

/* Gets all the place types list */
app.get("/placeTypes", async (req, res) => {
  try {
    const placeTypes = query.placeTypes;
    const placeTypesList = placeTypes.types;
    res.status(200).send(placeTypesList);
  } catch (error) {
    res
      .status(500)
      .send(
        "There was an error with fetching the list of all the place types list",
        error
      );
  }
});

/* Gets all the regions list */
app.get("/Regions", async (req, res) => {
  try {
    const regions = await query.getAllRegions();
    const regionsList = regions.map((val) => val.location);
    res.status(200).send(regionsList);
  } catch (error) {
    res
      .status(500)
      .send(
        "There was an error with fetching the list of all the regions list",
        error
      );
  }
});
/******************************************************************** TABLES APIs ********************************************************************/

/******************************************************************** SEARCH API ********************************************************************/
/* Returns the results of the search */
app.get("/search", async (req, res) => {
  query
    .search(JSON.parse(req.query.data))
    .then((resultEvents) => res.status(200).send(shuf.shuffle(resultEvents)))
    .catch((error) =>
      res.status(500).send("There was error in searching" + error)
    );
});
/******************************************************************** SEARCH API ********************************************************************/

/******************************************************************** PRODUCTION APIs ********************************************************************/
/*Returns production info */
/* Returns the user's details */
app.get("/productionInfo", async (req, res) => {
  query
    .getUserInfo(req.query.user_id)
    .then((user) => res.status(200).send(user))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching the production's details" + error
        )
    );
});

/* Returns a json with {"result": 1} if the user follow the production and {"result": 0} otherwise */
app.get("/isFollowed", auth.verify_auth, async (req, res) => {
  query
    .isFollowedTheProduction(req.query.user_id, req.query.production_id)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching the indicator whether a user follow the production or no" +
            error
        )
    );
});

/* Returns all the productions that a user follows */
app.get("/productionsFollowed", auth.verify_auth, async (req, res) => {
  query
    .getAllProductionsFollowed(req.query.user_id)
    .then((results) => res.status(200).send(results))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching all the productions a user follows" +
            error
        )
    );
});

/* Returns the production's number of followers */
app.get("/numberOfFollowers", async (req, res) => {
  query
    .getNumberOfFollowers(req.query.production_id)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching the production's number of followers" +
            error
        )
    );
});

/* Returns a json with {"result": 1} if the user ranked the production and {"result": 0} otherwise */
app.get("/isRanked", auth.verify_auth, async (req, res) => {
  query
    .checkIfRanked(req.query.user_id, req.query.production_id)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching the indicator whether a user ranked the production or no" +
            error
        )
    );
});

/* A post api - updates the rank of the production */
app.post("/updateRank", auth.verify_auth, async (req, res) => {
  query
    .handleProductionRank(
      req.query.user_id,
      req.query.production_id,
      parseFloat(req.query.new_rank)
    )
    .then(() => res.status(200).send("success rating"))
    .catch((error) =>
      res
        .status(500)
        .send("There was an error with updating the production's rank", error)
    );
});

/* Returns a json {"number_of_people_rated": ?, "production_rank": ?} - rank and how many people voted */
app.get("/getRank", async (req, res) => {
  query
    .getRankOfProduction(req.query.production_id)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching the production's rank and how many people voted" +
            error
        )
    );
});

/* Returns all the past events of the production */
app.get("/pastEvents", async (req, res) => {
  query
    .getAllPastEventById(req.query.production_id)
    .then((pastEvents) => res.status(200).send(pastEvents))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching the production's past events" +
            error
        )
    );
});

/* Returns all the future events of the production */
app.get("/futureEventsByProduction", async (req, res) => {
  query
    .getAllFutureEventById(req.query.production_id)
    .then((futureEvents) => res.status(200).send(futureEvents))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching the production's future events" +
            error
        )
    );
});

/* Handles the Follow / Unfollow of a production */
app.post("/follow", auth.verify_auth, async (req, res) => {
  try {
    const production_id = req.query.production_id;
    const user_id = req.query.user_id;
    await query.handleFollowOrUnfollow(user_id, production_id);
    res.status(200).send("Follow / Unfollow succeed");
  } catch (error) {
    res
      .status(500)
      .send("There was an error in following / unfollowing the production");
  }
});
/******************************************************************** PRODUCTION APIs ********************************************************************/

/******************************************************************** EVENT APIs ********************************************************************/
/* Inserts new event to the "Events_Details" table */
app.post(
  "/insertEvent",
  auth.verify_auth,
  multer.array("images"),
  async (req, res) => {
    const images = req.files;
    const event = req.body;
    const urls = await uploadAllImages(images);
    event.photos = urls;
    query
      .insertEvent(event)
      .then((event_id) => res.status(200).send({ event_id }))
      .catch((error) => {
        res
          .status(500)
          .send("There was an error inserting the new event" + error);
      });
  }
);
app.post("/updateOnStage", async (req, res) => {
  const on_stage = req.query.on_stage;
  const event_id = parseInt(req.query.event_id);
  query.updateOnStage(on_stage, event_id).catch((error) => {
    res.status(500).send("There was an error updating on stage value" + error);
  });
});

/* Inserts all the events to the "Events_Details" table */
app.post("/insertEvents", (req, res) => {
  try {
    const events = req.body;
    query.insertAllEventsData(events);
    res.status(200).send("Events inserted successfully!");
  } catch (error) {
    res.status(500).send("There was an error inserting the events");
  }
});

/* Updates event from the "Events_Details" table */
app.post(
  "/updateEvent",
  auth.production_authorization_for_event_change,
  multer.array("images"),
  async (req, res) => {
    const images = req.files;
    const event = req.body;

    const new_urls = await uploadAllImages(images, (isUpdate = true));
    event.photos = event.urls ? [...event.urls, ...new_urls] : new_urls;
    query
      .updateEvent(event)
      .then(() => {
        res.status(200).send("Update event succssed");
      })
      .catch((error) =>
        res.status(500).send({ error: "There was an error updating the event" })
      );
  }
);

/* Deletes event from the "Events_Details" table */
app.post(
  "/deleteEvent",
  auth.production_authorization_for_event_change,
  async (req, res) => {
    try {
      const event_id = req.query.event_id;
      await query.deleteEventFromEventDetails(event_id);
      res
        .status(200)
        .send("delete event from Events_Details and Users_Prefereces succssed");
    } catch (error) {
      res.status(500).send({ error: "There was an error deleting the event" });
    }
  }
);

/* Returns a json with the event's details */
app.get("/event", async (req, res) => {
  try {
    const event_id = parseInt(req.query.event_id);
    const event = await query.getEventByIdQuery(event_id);
    res.status(200).send(event[0]);
  } catch (error) {
    res
      .status(500)
      .send("There was an error with fetching the event's details", error);
  }
});

/* Returns a json with the event's details for update event page*/
app.get(
  "/eventForUpdate",
  auth.production_authorization_for_event_change,
  async (req, res) => {
    try {
      const event_id = parseInt(req.query.event_id);
      const event = await query.getEventByIdQueryNoformatting(event_id);
      res.status(200).send(event);
    } catch (error) {
      res
        .status(500)
        .send("There was an error with fetching the event's details", error);
    }
  }
);

/* Returns a json with {"result": 1} if the user like the event and {"result": 0} otherwise */
app.get("/isLiked", auth.verify_auth, async (req, res) => {
  try {
    const user_id = req.query.user_id;
    const event_id = req.query.event_id;
    const result = await query.isLikedTheEvent(user_id, event_id);
    res.status(200).send(result);
  } catch (error) {
    res
      .status(500)
      .send(
        "There was an error with fetching the indicator whether a user like the event or no",
        error
      );
  }
});

/* Handles the like/dislike of the user */
app.post("/like", auth.verify_auth, async (req, res) => {
  query
    .handleLikeOrDisLike(req.query.user_id, req.query.event_id)
    .then(() => res.status(200).send("Like / Dislike succssed"))
    .catch((error) =>
      res
        .status(500)
        .send("There was an error in liking / disliking the event", error)
    );
});

/* Returns all the events that a user likes */
app.get("/likedEvents", auth.verify_auth, async (req, res) => {
  query
    .getEventsLikedById(req.query.user_id)
    .then((results) => res.status(200).send(results))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching all the events a user likes" + error
        )
    );
});

/* Returns all the upcoming events - shuffled */
app.get("/futureEvents", async (req, res) => {
  query
    .getAllFutureEvents()
    .then((futureEvents) => res.status(200).send(shuf.shuffle(futureEvents)))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching all the up coming events" + error
        )
    );
});

/* Returns all the trending events - shuffled */
app.get("/trendingEvents", async (req, res) => {
  query
    .getAllTrendingEvents()
    .then((trendingEvents) =>
      res.status(200).send(shuf.shuffle(trendingEvents))
    )
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching all the trending events" + error
        )
    );
});

/* Returns all the Followed Production's events - shuffled */
app.get("/followedProductionsEvents", auth.verify_auth, async (req, res) => {
  query
    .getAllEventsTheirProductionFollowed(req.query.user_id)
    .then((events) => res.status(200).send(shuf.shuffle(events)))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching all the trending events" + error
        )
    );
});

/* Returns all the events based on the user's preferences */
app.get("/suggestedEvents", auth.verify_auth, async (req, res) => {
  query
    .getEventsByUserPreferences(req.query.user_id)
    .then((events) => res.status(200).send(shuf.shuffle(events)))
    .catch((error) =>
      res
        .status(500)
        .send(
          "There was an error with fetching all the events based on user's preferences" +
            error
        )
    );
});

/******************************************************************** EVENT APIs ********************************************************************/

/******************************************************************** USER APIs ********************************************************************/
/* Returns the user's details */
app.get("/userInfo", auth.verify_auth, async (req, res) => {
  query
    .getUserInfo(req.query.user_id)
    .then((user) => res.status(200).send(user))
    .catch((error) =>
      res
        .status(500)
        .send("There was an error with fetching the user's details" + error)
    );
});

/* Returns the user's preferences by it's user_id */
app.get("/getPreferences", auth.verify_auth, async (req, res) => {
  query
    .getUserPreferences(req.query.user_id)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res
        .status(500)
        .send("There was an error getting the user preferences" + error)
    );
});

/* Check Email Availability before sign up*/
app.get("/getUserIdByEmail", async (req, res) => {
  query
    .getUserIdByEmail(req.query.email)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res.status(500).send("There was an error getting user_id by " + error)
    );
});

/* Inserts the user JSON to the "Users_Details" table */
app.post(
  "/insertUser",
  multer.array("images"),
  auth.verify_auth,
  async (req, res) => {
    const images = req.files;
    const user = req.body;
    const url = await uploadAllImages(images, true);
    user.photo = url;
    query
      .insertUser(user)
      .then((result) => res.status(200).send(result))
      .catch((error) => {
        res
          .status(500)
          .send("There was an error inserting the new user" + error);
      });
  }
);

/* Inserts the users JSONs to the "Users_Details" table */
app.post("/insertUsers", (req, res) => {
  query
    .insertAllUsers(req.body)
    .then(() => res.status(200).send("Users inserted successfully!"))
    .catch((error) =>
      res.status(500).send("There was an error inserting the new users" + error)
    );
});
/******************************************************************** USER APIs ********************************************************************/

/*!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!* APIs THAT NEEDS TO BE CHECKED *!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!*/

/* A post api - update the personal details of user / the production details */
app.post(
  "/updateUserDetails",
  auth.verify_auth,
  multer.array("images"),
  async (req, res) => {
    const images = req.files;
    const user = req.body;
    if (user.urls) user.photo = user.urls;
    else {
      const new_urls = await uploadAllImages(images, (isUpdate = true));
      user.photo = new_urls;
    }

    query
      .updateUserDetails(user)
      .then(res.status(200).send("User details have been updated !"))
      .catch((error) =>
        res
          .status(500)
          .send({ error: "There was an error updating the user details" })
      );
  }
);
/**************************************** LIVE MODE **************************/
/* Returns all the comments of an event by event_id sorted by their post time */
app.get("/getAllComments", async (req, res) => {
  const event_id = parseInt(req.query.event_id);
  query
    .getAllComments(event_id)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res.status(500).send("could not fetch all the comments" + error)
    );
});

/*Returns start_time timpstamp of the event - for the Countdown */
app.get("/getStartTimeStamp", async (req, res) => {
  const event_id = parseInt(req.query.event_id);
  query
    .getStartTime(event_id)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res.status(500).send("could not fetch event's start timestamp" + error)
    );
});

/* Returns all the live images of the event */
app.get("/getAllPhotos", async (req, res) => {
  const event_id = parseInt(req.query.event_id);
  query
    .getAllPhotos(event_id)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res.status(500).send("could not fetch all the photos" + error)
    );
});
/* Returns all the vote's results based on the last 30 minutes */
app.get("/getVotes", async (req, res) => {
  const event_id = parseInt(req.query.event_id);
  query
    .getCalculatedVotes(event_id)
    .then((result) => res.status(200).send(result))
    .catch((error) =>
      res.status(500).send("could not fetch the votes" + error)
    );
});

/* Upload new comment and image */
app.post(
  "/uploadComment",
  auth.verify_auth,
  multer.array("images"),
  async (req, res) => {
    const photo = req.files;
    const comment = req.body;
    const url = await uploadAllImages(photo, true);
    comment.photo = url;
    query
      .insertNewComment(comment)
      .then(res.status(200).send("comment inserted successfully!"))
      .catch((error) =>
        res.status(500).send("insertion of new comment failed!" + error)
      );
  }
);

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
