const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
var cors = require("cors");
const bodyParser = require("body-parser");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();

const admin = require("firebase-admin");
const serviceAccount = require("./accountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(express.json());
app.use(cors());

const verifyFireBaseToken = async (req, res, next) => {
  // console.log("in the verify middleware", req.headers.authorization);

  if (!req.headers.authorization) {
    // do not allow to go
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    req.token_email = userInfo.email;
    // console.log("after token velidation", userInfo);
    next();
  } catch {
    // console.log("invalid token");
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

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
    const cropsCollection = database.collection("crops");

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

    // create crops
    app.post("/crops", verifyFireBaseToken, async (req, res) => {
      const newProduct = req.body;
      const result = await cropsCollection.insertOne(newProduct);
      res.send(result);
    });

    // all the crops
    app.get("/all-crops", async (req, res) => {
      //   const query = { _id: new ObjectId(params) };
      const cursor = cropsCollection.find({});
      const result = await cursor.toArray();
      res.send(result);
    });

    // search product
    app.get("/crops-search", async (req, res) => {
      const searchText = req.query.search || "";
      const result = await cropsCollection
        .find({ name: { $regex: searchText, $options: "i" } })
        .toArray();
      res.send(result);
    });

    // get latest 6 crops
    app.get("/latest-crops", async (req, res) => {
      const cursor = cropsCollection.find({}).sort({ createdAt: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    //find single crop details
    app.get("/crop/:id", verifyFireBaseToken, async (req, res) => {
      const params = req.params.id;
      const query = { _id: new ObjectId(params) };
      const result = await cropsCollection.findOne(query);

      res.send(result);
    });

    // update crops
    app.patch("/crops/:id", verifyFireBaseToken, async (req, res) => {
      const cropId = req.params.id;
      const updatedData = req.body;

      const filter = { _id: new ObjectId(cropId) };
      const updateDoc = { $set: updatedData };

      const result = await cropsCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    // my posts
    app.get("/crops", verifyFireBaseToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        if (email !== req.token_email) {
          return res.status(403).send({ message: "forbidden access" });
        }
        query["owner.ownerEmail"] = email;
      }

      const cursor = cropsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // my interests(requests)
    app.get("/my-interests", verifyFireBaseToken, async (req, res) => {
      const myEmail = req.query.email;
      const myInterests = await cropsCollection
        .find({
          "owner.ownerEmail": { $ne: myEmail },
          "interests.userEmail": myEmail,
        })
        .toArray();
      res.send(myInterests);
    });

    // delete posts
    app.delete("/crop/:id", verifyFireBaseToken, async (req, res) => {
      const cropId = req.params.id;
      const query = { _id: new ObjectId(cropId) };
      const result = await cropsCollection.deleteOne(query);
      res.send(result);
    });

    // create interest for buyer(non-owner)
    app.post("/interest/:id", verifyFireBaseToken, async (req, res) => {
      const interestedId = new ObjectId();
      const interest = req.body;
      const newInterest = {
        _id: interestedId,
        ...interest,
      };

      const params = req.params.id;
      const query = { _id: new ObjectId(params) };

      const update = {
        $push: {
          interests: newInterest,
        },
      };

      const result = await cropsCollection.updateOne(query, update);
      res.send(result);
    });

    // update interest request STATUS

    app.patch(
      "/interest/:cropId/accept/:interestId",
      verifyFireBaseToken,
      async (req, res) => {
        try {
          const { cropId, interestId } = req.params;
          const { quantity } = req.body;

          const cropObjectId = new ObjectId(cropId);
          const interestObjectId = new ObjectId(interestId);

          // Use $inc on root quantity + $set on nested interest status
          const result = await cropsCollection.updateOne(
            {
              _id: cropObjectId,
              "interests._id": interestObjectId,
              "interests.status": "pending",
            },
            {
              $inc: { quantity: -numericQuantity },
              $set: { "interests.$.status": "accepted" },
            }
          );

          res.send({ message: "Request accepted and quantity updated" });
        } catch (error) {
          console.error("Error accepting interest:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    // update interest request STATUS (Reject)
    app.patch(
      "/interest/:cropId/reject/:interestId",
      verifyFireBaseToken,
      async (req, res) => {
        const { cropId, interestId } = req.params;

        const cropObjectId = new ObjectId(cropId);
        const interestObjectId = new ObjectId(interestId);

        // Use $inc on root quantity + $set on nested interest status
        const result = await cropsCollection.updateOne(
          {
            _id: cropObjectId,
            "interests._id": interestObjectId,
            "interests.status": "pending",
          },
          {
            $set: { "interests.$.status": "Reject" },
          }
        );

        res.send({ message: "Request Rejected" });
      }
    );

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
