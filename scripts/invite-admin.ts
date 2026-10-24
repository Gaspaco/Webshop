// Production operator command; no passwords or tokens are accepted or printed.
process.env.NODE_ENV = "production";
const { inviteAdmin } = await import("../src/lib/admin-invitation.server");
const { describeServerError } = await import("../src/lib/server-log");
try {
  if (!process.argv[2]) throw new Error("Provide the recipient email.");
  const result = await inviteAdmin(process.argv[2], process.argv[3] || "Administrator");
  console.log(JSON.stringify(result));
  if (!result.passwordEmailAccepted) process.exitCode = 2;
} catch (error) { console.error("Administrator invitation could not be completed.", describeServerError(error)); process.exitCode = 1; }
