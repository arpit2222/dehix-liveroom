import mongoose from "mongoose";
const uri = "mongodb+srv://smitchavda22ce_db_user:Qj83RgUaqLcam3TY@cluster0.nhobysj.mongodb.net/";
async function test() {
  try {
    console.log("Connecting...");
    await mongoose.connect(uri);
    console.log("Connected.");
    const db = mongoose.connection.db;
    const session = await db.collection("dl_launch_sessions").findOne({ _id: new mongoose.Types.ObjectId("6a3f692632d65639bc0b4681") });
    console.log("Found session by ObjectId:", session);
    const sessionStr = await db.collection("dl_launch_sessions").findOne({ _id: "6a3f692632d65639bc0b4681" });
    console.log("Found session by String ID:", sessionStr);
    const allSessions = await db.collection("dl_launch_sessions").find().limit(5).toArray();
    console.log("All sessions count:", allSessions.length);
    console.log("All sessions sample:", allSessions.map(s => ({ _id: s._id, userId: s.userId })));
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    await mongoose.disconnect();
  }
}
test();
