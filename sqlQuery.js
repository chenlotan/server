const mysql = require("mysql2");
const moment = require("moment");
const m = require("moment-timezone");
require("dotenv").config();
/* create the connection to database */
const connection = mysql.createConnection({
  namedPlaceholders: true,
  host: "127.0.0.1",
  port: "3306",
  user: "get-party",
  password: process.env.REACT_APP_PASSWORD,
  database: "get-party-db",
});
const musicTypes = {
  types: [
    "Acoustic",
    "Chillout",
    "Classical",
    "Dance",
    "Electronic",
    "Folk",
    "Indie",
    "Jazz",
    "Latin",
    "Mizrahi",
    "Pop",
    "R&B",
    "Reggae",
    "Relaxation",
    "Rock",
    "Salsa",
    "World",
    "Yoga",
    "Deep House",
    "Techno",
    "Progressive Trance",
    "Mainstream",
  ],
};
const placeTypes = {
  types: [
    "Art Gallery",
    "Ballroom",
    "Bar",
    "Beach",
    "Beach House",
    "Banquet Hall",
    "Club",
    "Concert Hall",
    "Garden",
    "Indoor",
    "Lounge",
    "Mansion",
    "Outdoor",
    "Terrace",
    "Rooftop",
    "Wine Cellar",
    "Yacht",
    "Desert",
  ],
};
const Regions = { types: ["South", "Center", "Jerusalem", "Haifa", "North"] };

async function fixDatesFormat(results, year = false) {
  if (year) {
    for (let result of results) {
      (await result).start_time = moment((await result).start_time).format(
        "dddd, DD/MM/YYYY - HH:mm"
      );
      (await result).end_time = moment((await result).end_time).format(
        "dddd, DD/MM/YYYY - HH:mm"
      );
    }
  } else {
    for (let result of results) {
      (await result).start_time = moment((await result).start_time).format(
        "dddd, DD/MM - HH:mm"
      );
      (await result).end_time = moment((await result).end_time).format(
        "dddd, DD/MM - HH:mm"
      );
    }
  }

  return results;
}

async function generalFunction(query, inputs, flag) {
  const [results, fields] = await connection.promise().execute(query, inputs);
  return flag ? results[0] : results;
}

/******************************************************** Tables related ********************************************************/
/* Returns all the productions in the website */
async function getAllProductions() {
  return await generalFunction(
    "SELECT full_name FROM Users_Details WHERE is_producer = 1",
    [],
    false
  );
}

/* Returns all the Regions assignned in the website */
async function getAllRegions() {
  return await generalFunction(
    "SELECT DISTINCT location FROM Events_Details",
    [],
    false
  );
}

/******************************************************** Search related ********************************************************/
async function search(filters) {
  const {
    location,
    music_type,
    place_type,
    production,
    min_age,
    max_price,
    date,
  } = filters;
  const productionJSON = production ? JSON.stringify(production) : production;
  const locationJSON = location ? JSON.stringify(location) : location;
  const date_update = date
    ? moment(date, "YYYY-MM-DDTHH:mm:ss.SSSZ")
        .tz("Asia/Jerusalem")
        .format("YYYY-MM-DD HH:mm:ss")
    : date;
  const values = [
    locationJSON,
    locationJSON,
    date_update,
    date_update,
    max_price,
    max_price,
    min_age,
    min_age,
    place_type,
    place_type,
    music_type,
    music_type,
    productionJSON,
    productionJSON,
  ];

  const results = await generalFunction(
    "SELECT * FROM Events_Details WHERE (location MEMBER OF (?) OR ? IS NULL) AND (DATE(start_time) = DATE(?) OR ? IS NULL) AND (min_price <= ? OR ? IS NULL) AND (min_age >= ? OR ? IS NULL) AND (ARRAY_CONTAINS(place_type, ?) OR ? IS NULL) AND (ARRAY_CONTAINS(music_type, ?) OR ? IS NULL) AND (ARRAY_CONTAINS(CAST(? as JSON), CONCAT('[', JSON_QUOTE(production_name), ']')) OR ? IS NULL) AND (end_time >= CURRENT_TIMESTAMP() OR end_time IS NULL)",
    values,
    false
  );
  return await fixDatesFormat(results, true);
}

/******************************************************** Production related ********************************************************/
/* Returns the number of followers of production */
async function getNumberOfFollowers(production_id) {
  return await generalFunction(
    "SELECT number_of_followers FROM Production_Details WHERE user_id = ?",
    [production_id],
    true
  );
}

/* Handles Follow/Unfollow  the production */
async function handleFollowOrUnfollow(user_id, production_id) {
  await generalFunction(
    "UPDATE Users_Preferences SET followed_productions = CASE WHEN followed_productions IS NULL THEN JSON_ARRAY(?) WHEN ? MEMBER OF (followed_productions) THEN JSON_REMOVE(followed_productions, JSON_UNQUOTE(JSON_SEARCH(followed_productions, 'one', ?))) ELSE JSON_ARRAY_APPEND(followed_productions, '$', ?) END WHERE user_id = ?;",
    [production_id, production_id, production_id, production_id, user_id],
    true
  );
  await generalFunction(
    "UPDATE Production_Details SET number_of_followers = IF(ARRAY_CONTAINS((SELECT followed_productions FROM Users_Preferences WHERE user_id = ?), JSON_ARRAY(?)), number_of_followers + 1, number_of_followers - 1) WHERE user_id = ?",
    [user_id, production_id, production_id],
    true
  );
}

/* Returns the rank of the production and how many voted */
async function getRankOfProduction(production_id) {
  return await generalFunction(
    "SELECT production_rank, number_of_people_rated FROM Production_Details WHERE user_id = ?",
    [production_id],
    true
  );
}

/* Updates new rank to production */
async function handleProductionRank(user_id, production_id, rank) {
  await generalFunction(
    "UPDATE Users_Preferences SET productions_rated = JSON_ARRAY_APPEND(productions_rated, '$', ?) where user_id = ?",
    [production_id, user_id],
    true
  );
  await generalFunction(
    "UPDATE Production_Details AS pd SET pd.production_rank = ((pd.production_rank * pd.number_of_people_rated) + ?) / (pd.number_of_people_rated + 1) WHERE pd.user_id = ?",
    [rank, production_id],
    true
  );
  await generalFunction(
    "UPDATE Production_Details SET number_of_people_rated = number_of_people_rated + 1 WHERE user_id = ?",
    [production_id],
    true
  );
}

/* Return whether a user ranked a production or not */
async function checkIfRanked(user_id, production_id) {
  return await generalFunction(
    "SELECT (? MEMBER OF (productions_rated)) AS result FROM Users_Preferences WHERE user_id = ?",
    [production_id, user_id],
    true
  );
}

/* Returns all the past events of the production with production_id */
async function getAllPastEventById(production_id) {
  const results = await generalFunction(
    "SELECT * FROM Events_Details WHERE start_time < CURDATE() AND user_id = ?",
    [production_id],
    false
  );
  return await fixDatesFormat(results);
}

/* Returns all the future events of the production with production_id */
async function getAllFutureEventById(production_id) {
  const results = await generalFunction(
    "SELECT * FROM Events_Details WHERE start_time >= CURDATE() AND user_id = ?",
    [production_id],
    false
  );
  return await fixDatesFormat(results);
}

/******************************************************** Events related ********************************************************/
/* Insert single event given to the "Events_Details" table */
async function insertEvent(event) {
  const {
    user_id,
    production_name,
    event_name,
    address,
    location,
    start_time,
    end_time,
    short_description,
    long_description,
    min_price,
    max_price,
    min_age,
    music_type,
    place_type,
    photos,
  } = event;
  const photosJson = JSON.stringify(photos);
  const music_typeJson = JSON.stringify(music_type);
  const place_typeJson = JSON.stringify(place_type);
  // const start_time_timestamp = moment(start_time, "DD/MM/YYYY HH:mm").format("YYYY-MM-DD HH:mm:ss");
  // const end_time_timestamp = moment(end_time, "DD/MM/YYYY HH:mm").format("YYYY-MM-DD HH:mm:ss");

  const start_time_timestamp = m(start_time, "ddd, DD MMM YYYY HH:mm:ss [GMT]")
    .tz("Asia/Jerusalem")
    .format("YYYY-MM-DD HH:mm:ss");
  const end_time_timestamp = m(end_time, "ddd, DD MMM YYYY HH:mm:ss [GMT]")
    .tz("Asia/Jerusalem")
    .format("YYYY-MM-DD HH:mm:ss");

  const values = [
    user_id,
    production_name,
    event_name,
    address,
    location,
    start_time_timestamp,
    end_time_timestamp,
    short_description,
    long_description,
    min_price,
    max_price,
    min_age,
    music_typeJson,
    place_typeJson,
    photosJson,
    null,
  ];
  const results = await generalFunction(
    "INSERT INTO Events_Details (user_id, production_name, event_name, address, location, start_time, end_time, short_description, long_description, min_price, max_price, min_age, music_type, place_type, photos, on_stage) VALUES (?, ?, ?, ?, ?, ?,  ?,  ? , ?, ?, ?, ?, ?, ?, ?, ?)",
    values,
    false
  );
  const id = results.insertId;
  return id;
}
async function updateEvent(event) {
  const {
    event_id,
    event_name,
    address,
    location,
    start_time,
    end_time,
    short_description,
    long_description,
    min_price,
    max_price,
    min_age,
    music_type,
    place_type,
    photos,
  } = event;
  const photosJson = JSON.stringify(photos);
  const music_typeJson = JSON.stringify(music_type);
  const place_typeJson = JSON.stringify(place_type);
  const start_time_timestamp = m(start_time)
    .tz("Asia/Jerusalem")
    .format("YYYY-MM-DD HH:mm:ss");
  const end_time_timestamp = m(end_time)
    .tz("Asia/Jerusalem")
    .format("YYYY-MM-DD HH:mm:ss");
  const params = [
    event_name,
    address,
    location,
    start_time_timestamp,
    end_time_timestamp,
    short_description,
    long_description,
    min_price,
    max_price,
    min_age,
    music_typeJson,
    place_typeJson,
    photosJson,
    event_id,
  ];
  const results = await generalFunction(
    "UPDATE Events_Details SET event_name = ?, address = ?, location = ?, start_time = ?, end_time = ?, short_description = ?, long_description = ?, min_price = ?, max_price = ?, min_age = ?, music_type = ?, place_type = ?, photos = ?  WHERE event_id = ?",
    params,
    false
  );
}
async function updateOnStage(on_stage, event_id) {
  await generalFunction(
    "UPDATE Events_Details SET on_stage = ? WHERE event_id = ?",
    [on_stage, event_id],
    false
  );
}

async function deleteEventFromEventDetails(event_id) {
  await generalFunction(
    "DELETE FROM Events_Details WHERE event_id=?",
    [event_id],
    true
  );
  await generalFunction(
    "UPDATE Users_Preferences SET favorite_events = CASE WHEN ? MEMBER OF (favorite_events) THEN JSON_REMOVE(favorite_events, JSON_UNQUOTE(JSON_SEARCH(favorite_events, 'one', ?))) ELSE favorite_events END",
    [event_id, event_id],
    true
  );
}

/* Returns event by id */
async function getEventByIdQuery(event_id) {
  const results = await generalFunction(
    "SELECT * FROM Events_Details WHERE event_id = ?",
    [event_id],
    true
  );
  return await fixDatesFormat([results]);
}

/* Returns event by id */
async function getEventByIdQueryNoformatting(event_id) {
  const results = await generalFunction(
    "SELECT * FROM Events_Details WHERE event_id = ?",
    [event_id],
    true
  );
  return results;
}

/* Returns all future events */
async function getAllFutureEvents() {
  const results = await generalFunction(
    "SELECT * FROM Events_Details WHERE start_time >= CURDATE()",
    [],
    false
  );
  return await fixDatesFormat(results);
}

/* Returns all Trending events */
async function getAllTrendingEvents() {
  const results = await generalFunction(
    "SELECT * FROM Events_Details WHERE start_time >= CURDATE() AND start_time <= DATE_ADD(CURDATE(), INTERVAL ? DAY);",
    [30],
    false
  );
  return await fixDatesFormat(results);
}

/* Returns all the events that a user follows their production */
async function getAllEventsTheirProductionFollowed(user_id) {
  const results = await generalFunction(
    "SELECT * FROM Events_Details, Users_Preferences WHERE Users_Preferences.user_id = ? AND Events_Details.user_id MEMBER OF (Users_Preferences.followed_productions)",
    [user_id],
    false
  );
  return await fixDatesFormat(results);
}

/* Handle like/dislike the event */
async function handleLikeOrDisLike(user_id, event_id) {
  await generalFunction(
    "UPDATE Users_Preferences SET favorite_events = CASE WHEN favorite_events IS NULL THEN JSON_ARRAY(?) WHEN ? MEMBER OF (favorite_events) THEN JSON_REMOVE(favorite_events, JSON_UNQUOTE(JSON_SEARCH(favorite_events, 'one', ?))) ELSE JSON_ARRAY_APPEND(favorite_events, '$', ?) END WHERE user_id = ?",
    [event_id, event_id, event_id, event_id, user_id],
    true
  );
}

/******************************************************** User related ********************************************************/
/* Insert single user given to the "Users_Details" table and open a new preference table, and if producer also add new line in "Production_Details" */
async function insertUser(user) {
  const {
    user_id,
    is_producer,
    full_name,
    birth_date,
    phone_number,
    address,
    email,
    photo,
    favorite_music_types,
    favorite_locations,
  } = user;
  const photoJson = JSON.stringify(photo);
  const is_producer_parsed = JSON.parse(is_producer);
  const values = [
    user_id,
    is_producer_parsed,
    full_name,
    birth_date,
    phone_number,
    address,
    email,
    photoJson,
  ];
  await generalFunction(
    "INSERT INTO Users_Details (user_id, is_producer, full_name, birth_date, phone_number, address, email, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    values,
    false
  );

  const favorite_music_types_json = favorite_music_types
    ? JSON.stringify(favorite_music_types)
    : [];
  const favorite_locations_types_json = favorite_locations
    ? JSON.stringify(favorite_locations)
    : [];
  const val = [
    user_id,
    favorite_music_types_json,
    favorite_locations_types_json,
  ];

  await generalFunction(
    "INSERT INTO Users_Preferences (user_id, favorite_music_types, favorite_locations, favorite_events, followed_productions, productions_rated) VALUES (?, ?, ?, '[]', '[]', '[]')",
    val,
    false
  );

  if (is_producer_parsed) {
    await generalFunction(
      "INSERT INTO Production_Details (user_id, number_of_followers, number_of_people_rated, production_rank) VALUES (?, 0, 0, 5)",
      [user_id],
      false
    );
  }
  return {
    user_id,
    is_producer,
    full_name,
    birth_date,
    phone_number,
    address,
    email,
    photo,
  };
}

/* Returns the user's details by user_id */
async function getUserInfo(user_id) {
  return await generalFunction(
    "SELECT * FROM Users_Details WHERE user_id = ?",
    [user_id],
    true
  );
}

/* Returns the user's preferences */
async function getUserPreferences(user_id) {
  return await generalFunction(
    "SELECT * FROM Users_Preferences WHERE user_id = ?",
    [user_id],
    true
  );
}

/* Returns all the events based on the user preferences */
async function getEventsByUserPreferences(user_id) {
  const results = await generalFunction(
    "select Events_Details.* from Events_Details, Users_Preferences where Users_Preferences.user_id = ? and (JSON_OVERLAPS(favorite_locations, place_type) + JSON_OVERLAPS(favorite_music_types, music_type) >= 1)",
    [user_id],
    false
  );
  return await fixDatesFormat(results);
}

/* Returns indicator whether the user follow the production or not */
async function isFollowedTheProduction(user_id, production_id) {
  return await generalFunction(
    "SELECT (? MEMBER OF (followed_productions)) AS result FROM Users_Preferences WHERE user_id = ?",
    [production_id, user_id],
    true
  );
}

/* Returns all the productions followed by user where user_id - (Array of JSONs) */
async function getAllProductionsFollowed(user_id) {
  return await generalFunction(
    "SELECT ud.* FROM Users_Preferences up JOIN Users_Details ud ON JSON_CONTAINS(up.followed_productions, JSON_QUOTE(ud.user_id)) WHERE up.user_id = ?",
    [user_id],
    false
  );
}

/* Returns indicator whether the user liked the event or not */
async function isLikedTheEvent(user_id, event_id) {
  return await generalFunction(
    "SELECT (? MEMBER OF (favorite_events)) AS result FROM Users_Preferences WHERE user_id = ?",
    [event_id, user_id],
    true
  );
}

/* Returns all the events liked by user where user_id - (Array of JSONs) */
async function getEventsLikedById(user_id) {
  const results = await generalFunction(
    "SELECT * FROM Events_Details WHERE ARRAY_CONTAINS((SELECT favorite_events FROM Users_Preferences WHERE user_id = ?), JSON_ARRAY(CAST(event_id AS char )))",
    [user_id],
    false
  );
  return await fixDatesFormat(results);
}

/* Return user id by email provided (for check availability of emails in sign up) */
async function getUserIdByEmail(email) {
  return await generalFunction(
    "SELECT user_id FROM Users_Details WHERE email = ?",
    [email],
    false
  );
}

/* update details function */
async function updateUserDetails(user) {
  const {
    user_id,
    is_producer,
    full_name,
    birth_date,
    phone_number,
    address,
    email,
    photo,
    favorite_music_types,
    favorite_locations,
  } = user;
  const photoJson = JSON.stringify(photo);
  const is_producer_parsed = JSON.parse(is_producer);
  const values = [
    is_producer_parsed,
    full_name,
    birth_date,
    phone_number,
    address,
    email,
    photoJson,
    user_id,
  ];
  await generalFunction(
    "UPDATE Users_Details SET is_producer = ?, full_name = ?, birth_date = ?, phone_number = ?, address = ?, email = ?, photo = ? WHERE user_id = ?",
    values,
    false
  );
  const favorite_music_types_json = favorite_music_types
    ? JSON.stringify(favorite_music_types)
    : [];
  const favorite_locations_types_json = favorite_locations
    ? JSON.stringify(favorite_locations)
    : [];

  const val = [
    favorite_music_types_json,
    favorite_locations_types_json,
    user_id,
  ];

  await generalFunction(
    "UPDATE Users_Preferences SET favorite_music_types = ?, favorite_locations = ? WHERE user_id = ?",
    val,
    false
  );
}

/* Insert all the events given to the "Events_Details" table */
function insertAllEventsData(events) {
  for (const event of events) {
    insertEvent(event);
  }
}

/* Insert all the users given to the "Users_Details" table */
function insertAllUsers(users) {
  for (const user of users) {
    insertUser(user);
  }
}

/* insert new comment to the table Live_Mode */
async function insertNewComment(comment) {
  const {
    event_id,
    user_id,
    full_name,
    avatar,
    content,
    photo,
    votes,
    post_time,
  } = comment;

  const photoJson = JSON.stringify(photo);
  const post_time_timestamp = m
    .tz(post_time, "ddd MMM DD YYYY HH:mm:ss [GMT]ZZ (z)", "Asia/Jerusalem")
    .format("YYYY-MM-DD HH:mm:ss");

  const values = [
    event_id,
    user_id,
    full_name,
    avatar,
    content,
    photoJson,
    votes,
    post_time_timestamp,
  ];
  await generalFunction(
    "INSERT INTO Live_Mode (event_id, user_id, full_name, avatar, content, photo, votes, post_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    values,
    false
  );
}
/* get start timestamp of the event */
async function getStartTime(event_id) {
  const result = await generalFunction(
    "SELECT start_time FROM Events_Details Where event_id = ?",
    [event_id],
    true
  );
  return result.start_time;
}
/* get all the comments of an event sorted by time posted */
async function getAllComments(event_id) {
  const result = await generalFunction(
    "SELECT * FROM  Live_Mode Where event_id = ?",
    [event_id],
    false
  );
  result.sort((a, b) => {
    const postTimeA = new Date(a.post_time);
    const postTimeB = new Date(b.post_time);
    return postTimeB - postTimeA;
  });
  return result;
}

/* get all the photos of an event */
async function getAllPhotos(event_id) {
  const result = await generalFunction(
    "SELECT photo FROM Live_Mode WHERE event_id = ?",
    [event_id],
    false
  );
  return result.reverse();
}

/* get all the calculated votes */
async function getCalculatedVotes(event_id) {
  const votes = await generalFunction(
    "SELECT votes FROM Live_Mode WHERE post_time >= NOW() - INTERVAL 30 MINUTE AND event_id = ?",
    [event_id],
    false
  );
  number_of_rows = votes.length;
  if (number_of_rows === 0) return null;
  d = {
    waiting_time: {
      4: 5,
      3: 20,
      2: 45,
      1: 70,
    },
    avg_ages: {
      1: 19.5,
      2: 23,
      3: 27.5,
      4: 32,
    },
  };
  general_opinion = crowding = waiting_time = avg_ages = 0;
  votes.map((vote) => {
    general_opinion += parseInt(vote.votes.general_opinion);
    crowding += parseInt(vote.votes.crowding);
    waiting_time += d.waiting_time[vote.votes.waiting_time];
    avg_ages += d.avg_ages[vote.votes.average_ages];
  });
  return {
    general_opinion: Math.round((general_opinion / number_of_rows) * 10) / 10,
    crowding: crowding / number_of_rows,
    waiting_time: Math.round(waiting_time / number_of_rows),
    avg_ages: avg_ages / number_of_rows,
  };
}

module.exports = {
  getEventsByUserPreferences,
  getCalculatedVotes,
  updateOnStage,
  getAllPhotos,
  getAllComments,
  insertNewComment,
  getAllEventsTheirProductionFollowed,
  checkIfRanked,
  getRankOfProduction,
  getAllTrendingEvents,
  insertAllEventsData,
  getEventByIdQuery,
  insertAllUsers,
  insertUser,
  insertEvent,
  updateEvent,
  getStartTime,
  deleteEventFromEventDetails,
  handleLikeOrDisLike,
  handleFollowOrUnfollow,
  getAllFutureEvents,
  getAllPastEventById,
  handleProductionRank,
  updateUserDetails,
  getEventByIdQueryNoformatting,
  getUserPreferences,
  musicTypes,
  placeTypes,
  Regions,
  getAllProductionsFollowed,
  isLikedTheEvent,
  isFollowedTheProduction,
  getUserInfo,
  getEventsLikedById,
  getAllRegions,
  getAllFutureEventById,
  getNumberOfFollowers,
  getAllProductions,
  search,
  getUserIdByEmail,
};
