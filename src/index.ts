import app from "./app";
import { startStudySessionReportCron } from "./jobs/studySessionReportCron";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startStudySessionReportCron();
});
