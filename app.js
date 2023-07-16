const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbpath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        console.log(payload);
        request.username = payload.username;
        next();
      }
    });
  }
};

// API 1 login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 2 return a list of states

const getStatesList = (eachState) => {
  return {
    stateId: eachState.state_id,
    stateName: eachState.state_name,
    population: eachState.population,
  };
};

app.get("/states/", authenticateToken, async (request, response) => {
  try {
    const getStatesQuery = `
    select * from state;`;
    const statesList = await db.all(getStatesQuery);
    response.send(statesList.map((eachState) => getStatesList(eachState)));
    //response.send(statesList);
  } catch (e) {
    console.log(`Error:${e.message}`);
    process.exit(1);
  }
});

// API 3 returns a state based on the stateID

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  try {
    const { stateId } = request.params;
    const getStateBasedOnIDQuery = `
        select * from state where state_id=${stateId};`;
    const getState = await db.get(getStateBasedOnIDQuery);
    response.send(getStatesList(getState));
  } catch (e) {
    console.log(`Error:${e.message}`);
  }
});

// API 4 Create a district in the district table

app.post("/districts/", authenticateToken, async (request, response) => {
  try {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const postDistrictQuery = `
        INSERT INTO
        district (district_name,state_id,cases,cured,active,deaths)
        VALUES ('${districtName}',${stateId},${cases},${cured},${active},${deaths});`;
    const districtAdded = await db.run(postDistrictQuery);
    response.send("District Successfully Added");
  } catch (e) {
    console.log(`Error: ${e.message}`);
    process.exit(1);
  }
});

//API 5 Returns a district based on the district ID

const getDistrictInreqFormat = (eachDistrict) => {
  return {
    districtId: eachDistrict.district_id,
    districtName: eachDistrict.district_name,
    stateId: eachDistrict.state_id,
    cases: eachDistrict.cases,
    cured: eachDistrict.cured,
    active: eachDistrict.active,
    deaths: eachDistrict.deaths,
  };
};

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
  select * from district
  where district_id = ${districtId};`;
    const getDistrict = await db.get(getDistrictQuery);
    response.send(getDistrictInreqFormat(getDistrict));
  }
);

//API 6 Deletes a district from the district table based on the district ID

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    try {
      const { districtId } = request.params;
      const delDistrictQuery = `
        DELETE FROM DISTRICT 
        WHERE district_id=${districtId}`;
      await db.run(delDistrictQuery);
      response.send("District Removed");
    } catch (e) {
      console.log(`Error:${e.message}`);
    }
  }
);

// API 7 Updates the details of a specific district based on the district ID

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    try {
      const {
        districtName,
        stateId,
        cases,
        cured,
        active,
        deaths,
      } = request.body;
      const { districtId } = request.params;
      const putDistrictQuery = `
    UPDATE 
        DISTRICT
    SET 
        district_name='${districtName}',
        state_id=${stateId},
        cases=${cases},
        cured=${cured},
        active=${active},
        deaths=${deaths}
        WHERE 
        district_id = ${districtId};`;
      await db.run(putDistrictQuery);
      response.send("District Details Updated");
    } catch (e) {
      console.log(`Error:${e.message}`);
    }
  }
);

//API 8 Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    try {
      const { stateId } = request.params;
      const getStatesStatsQuery = `
        select
            sum(cases),
            sum(cured),
            sum(active),
            sum(deaths)
        from 
            district
        where 
            state_id = ${stateId};`;
      const stats = await db.get(getStatesStatsQuery);
      console.log(stats);
      response.send({
        totalCases: stats["sum(cases)"],
        totalCured: stats["sum(cured)"],
        totalActive: stats["sum(active)"],
        totalDeaths: stats["sum(deaths)"],
      });
    } catch (e) {
      console.log(`Error:${e.message}`);
    }
  }
);

module.exports = app;
