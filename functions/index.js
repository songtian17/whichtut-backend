const {setGlobalOptions} = require("firebase-functions/v2");
const {onRequest} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {scrapeCourse} = require("./course");

initializeApp();
const db = getFirestore();
setGlobalOptions({region: "asia-southeast1", memory: "1GiB"});

exports.getcourseinfo = onRequest(
    {cors: [/whichtutcanicrash.*\.web\.app$/,
      /whichtutcanicrash\.firebaseapp\.com$/]},
    async (req, res) => {
      const querySemester = req.query.semester;
      const queryCourseCode = req.query.courseCode;
      if (!querySemester || !queryCourseCode) {
        res.status(400).end();
      }

      const docRef = db.collection(querySemester).doc(queryCourseCode);
      const doc = await docRef.get();
      if (!doc.exists) {
        const courseSchedule = await scrapeCourse(queryCourseCode);
        if (courseSchedule.semester !== querySemester) {
          res.status(500)
              .send("Semesters do not match. Contact server administrator.");
        }

        await db
            .collection(queryCourseCode)
            .doc(queryCourseCode)
            .set(courseSchedule);
        res.json(courseSchedule);
      } else {
        res.json(doc.data());
      }
    });
