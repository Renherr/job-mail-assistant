function buildTaskFromMail(parsedMail) {
  if (!parsedMail.needsAction) {
    return null;
  }

  return {
    title: parsedMail.suggestedAction || "处理求职邮件",
    dueAt: parsedMail.actionDeadline || null,
    priority:
      parsedMail.mailType === "written_test_invite" || parsedMail.mailType === "interview_invite"
        ? "high"
        : parsedMail.actionDeadline
          ? "high"
          : "medium",
    status: "todo",
    completedAt: null,
    description: parsedMail.summary || null,
  };
}

module.exports = {
  buildTaskFromMail,
};
