const puppeteer = require("puppeteer");

/**
 *
 * @param {string} courseCode
 * @return {object}
 */
async function scrapeCourse(courseCode) {
  const semesterSelectedOptionSelector =
    "select[name='acadsem'] option[selected='selected']";
  const courseSearchInputSelector = "input[type='text'][name='r_subj_code']";
  const courseSearchButtonSelector = "input[type='button'][value='Search']";

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"],
  });
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
      (target) => target.opener() === page.target(),
  );
  const courseSchedulePage = await newTarget.page();

  const courseSchedule = await extractCourseSchedule(courseSchedulePage);
  courseSchedule.semester = semester;
  return courseSchedule;
}

/**
 *
 * @param {puppeteer.Page} schedulePage
 * @return {object}
 */
async function extractCourseSchedule(schedulePage) {
  const result = await schedulePage.evaluate(() => {
    const courseCode = document.querySelector(
        "table:nth-child(4) > tbody > tr:nth-child(1) > td:nth-child(1)",
    ).innerText;
    const courseName = document.querySelector(
        "table:nth-child(4) > tbody > tr:nth-child(1) > td:nth-child(2)",
    ).innerText;
    const academicUnits = document.querySelector(
        "table:nth-child(4) > tbody > tr:nth-child(1) > td:nth-child(3)",
    ).innerText;

    const scheduleTable = document.querySelector("table:nth-child(5) > tbody");
    const dataRows = Array.from(scheduleTable.children).slice(1);

    let currIndex;
    const tutorials = [];
    for (const row of dataRows) {
      const column = Array.from(row.children);
      let index = column[0].innerText;
      if (index) {
        currIndex = index;
      } else {
        index = currIndex;
      }

      const type = column[1].innerText;
      if (type !== "TUT") {
        continue;
      }
      const group = column[2].innerText;
      const day = column[3].innerText;
      const time = column[4].innerText;
      const venue = column[5].innerText;
      const remark = column[6].innerText;
      tutorials.push({index, group, day, time, venue, remark});
    }

    const courseData = {
      courseName: courseName,
      courseCode: courseCode,
      academicUnits: academicUnits,
      tutorials: tutorials,
    };
    return courseData;
  });
  return result;
}

module.exports.scrapeCourse = scrapeCourse;
