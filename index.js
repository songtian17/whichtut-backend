const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fastify = require("fastify")();
const puppeteer = require("puppeteer");

const serviceAccount = require("./cert.json");

process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

fastify.get(
  "/",
  {
    schema: {
      querystring: {
        type: "object",
        properties: {
          semester: { type: "string" },
          courseCode: { type: "string" },
        },
        required: ["semester", "courseCode"],
      },
    },
  },
  async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET");
    const courseInfo = await retriveCourseInfo(
      request.query.semester,
      request.query.courseCode
    );
    reply.send(courseInfo);
  }
);

async function retriveCourseInfo(sem, courseCode) {
  const courseRef = db.collection(sem).doc(courseCode);
  const doc = await courseRef.get();
  if (!doc.exists) {
    const { semester, scheduleData } = await scrapeCourse(courseCode);
    if (sem !== semester) {
      throw new Error("Semesters do not match");
    }

    await db
      .collection(semester)
      .doc(courseCode)
      .set(scheduleData[courseCode]);
    return scheduleData[courseCode];
  } else {
    return doc.data();
  }
}

async function scrapeCourse(courseCode) {
  const semesterSelectedOptionSelector =
    'select[name="acadsem"] option[selected="selected"]';
  const courseSearchInputSelector = 'input[type="text"][name="r_subj_code"]';
  const courseSearchButtonSelector = 'input[type="button"][value="Search"]';

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("https://wish.wis.ntu.edu.sg/webexe/owa/aus_schedule.main");
  await page.waitForSelector(semesterSelectedOptionSelector);
  const semester = await page.$eval(semesterSelectedOptionSelector, (el) => {
    return el.innerText;
  });

  await page.waitForSelector(courseSearchButtonSelector);
  await page.type(courseSearchInputSelector, courseCode);
  await page.click(courseSearchButtonSelector);

  const newTarget = await browser.waitForTarget(
    (target) => target.opener() === page.target()
  );
  const schedulePage = await newTarget.page();

  const scheduleData = await extractScheduleData(schedulePage);

  return { semester, scheduleData };
}

async function extractScheduleData(schedulePage) {
  const result = await schedulePage.evaluate(() => {
    const courseCode = document.querySelector(
      "body > center > table:nth-child(4) > tbody > tr:nth-child(1) > td:nth-child(1)"
    ).innerText;
    const courseName = document.querySelector(
      "body > center > table:nth-child(4) > tbody > tr:nth-child(1) > td:nth-child(2)"
    ).innerText;
    const academicUnits = document.querySelector(
      "body > center > table:nth-child(4) > tbody > tr:nth-child(1) > td:nth-child(3)"
    ).innerText;

    const scheduleTable = document.querySelector(
      "body > center > table:nth-child(5) > tbody"
    );
    const dataRows = Array.from(scheduleTable.children).slice(1);

    let currIndex;
    let indexClasses = [];
    let indexes = {};
    for (const row of dataRows) {
      const column = Array.from(row.children);
      let index = column[0].innerText;
      if (index) {
        currIndex = index;
        if (indexClasses.length > 0) {
          indexes[currIndex] = indexClasses;
        }
        indexClasses = [];
      } else {
        index = currIndex;
      }

      const type = column[1].innerText;
      const group = column[2].innerText;
      const day = column[3].innerText;
      const time = column[4].innerText;
      const venue = column[5].innerText;
      const remark = column[6].innerText;
      indexClasses.push({ type, group, day, time, venue, remark });
    }
    indexes[currIndex] = indexClasses;

    const courseData = {
      courseName: courseName,
      academicUnits: academicUnits,
      indexes: indexes,
    };

    let res = {};
    res[courseCode] = courseData;
    return res;
  });
  return result;
}

fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
