const express = require("express");

const app = express();
const port = 8000;
const path = require("path");
const fs = require("fs").promises;
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/",
];

app.get("/", async (req, res) => {
  const credentials = await fs.readFile("credentials.json");

  const auth = await authenticate({
    keyfilePath: path.join(__dirname, "credentials.json"),
    scopes: SCOPES,
  });

//   console.log("This is AUTH = ", auth);

  const gmail = google.gmail({ version: "v1", auth });

  const response = await gmail.users.labels.list({
    userId: "me",
  });

  const LABEL_NAME = "Vacation";

  async function loadCredentials() {
    const filePath = path.json(process.cwd(), "credentials.json");
    const content = await fs.readFile(filePath, { encoding: "utf-8" });

    return JSON.parse(content);
  }

  async function getUnrepiedMessages(auth) {
    const gmail = google.gmail({ version: "v1", auth });

    const res = await gmail.users.messages.list({
      userId: "me",
      q: "-in:chats -from:me -has:userlabels",
    });

    return res.data.messages || [];
  }

  async function sendReply(auth, message) {
    const gmail = google.gmail({ version: "v1", auth });

    const res = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From"],
    });

    const subject = res.data.payload.headers.find(
      (header) => header.name === "Subject"
    ).value;

    const from = res.data.payload.headers.find(
      (header) => header.name === "From"
    ).value;

    const replyTo = from.match(/<(.*)>/)[1];
    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const replyBody = `Hi, \n\n This messages is automatically generated using my NodeJS app and Sorry, but i am currently on my vacation so I will contact you later. \n\n Regards, \n Shivansh Soni`;
    const rawMessage = [
      `From: me`,
      `To: ${replyTo}`,
      `Subject: ${replySubject}`,

      `In-Reply-To: ${message.id}`,
      `References: ${message.id}`,
      "",
      replyBody,
    ].join("\n");

    const encodedMessage = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });
  }

  async function createLabel(auth) {
    const gmail = google.gmail({ version: "v1", auth });

    try {
      const res = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: LABEL_NAME,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      return res.data.id;
    } catch (err) {
      if (err.code === 409) {
        const res = await gmail.users.labels.list({
          userId: "me",
        });

        const label = res.data.labels.find(
          (label) => label.name === LABEL_NAME
        );

        return label.id;
      } else {
        throw err;
      }
    }
  }

  async function addLabel(auth, message, labelId) {
    const gmail = google.gmail({ version: "v1", auth });

    await gmail.users.messages.modify({
      userId: "me",
      id: message.id,
      requestBody: {
        addLabelIds: [labelId],
        removeLabelIds: ["INBOX"],
      },
    });
  }

  async function main() {
    const labelId = await createLabel(auth);
    console.log(`Created or found label with id ${labelId}`);

    setInterval(async () => {
      const messages = await getUnrepiedMessages(auth);
      console.log(`Found ${messages.length} unreplied messages`);

      for (const message of messages) {
        await sendReply(auth, message);

        console.log(`Sent reply to message with id ${message.id}`);

        await addLabel(auth, message, labelId);
        console.log(`Added label to messages with id ${message.id}`);
      }
    }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000);
  }

  main().catch(console.error);

  const labels = response.data.labels;

  res.send("You have successfully run the service");
});

app.listen(port, () => {
  console.log(`Listening at port: ${port}`);
});


