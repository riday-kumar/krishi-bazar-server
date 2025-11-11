const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
var cors = require("cors");
const bodyParser = require("body-parser");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();

// middleware
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("You Man Go NOw");
});

// uri
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@cluster0.ivoyxep.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("Krishi_Bazar");
    const userCollection = database.collection("users");

    //get all the user
    app.get("/user", async (req, res) => {
      const cursor = userCollection.find({});
      const result = await cursor.toArray();
      res.send(result);
    });

    // user create
    app.post("/user", async (req, res) => {
      const email = req.body.userEmail;
      const query = { userEmail: email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists." });
      }
      const result = await userCollection.insertOne(req.body);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("You successfully connected to MongoDB!");
  } finally {
    //
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`our server is listening on port ${port}`);
});
