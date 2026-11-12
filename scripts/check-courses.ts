import { COURSES, courseLines } from "../src/data/courses.ts";
for (const c of COURSES) {
  const ls = courseLines(c);
  console.log(c.id, ls.length, "lines; e.g.", ls[0]?.key);
  if (process.argv[2] === c.id) for (const l of ls) console.log("   ", l.key);
}
