const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const moment = require('moment');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.modify'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function checkIfLabelExists(auth, labelName) {
    const gmail = google.gmail({ version: 'v1', auth });
  
    const res = await gmail.users.labels.list({ userId: 'me' });
    const labels = res.data.labels;
  
    // Check if the label already exists
    const label = labels.find((label) => label.name === labelName);
    return label; // Returns true if label exists, false otherwise
}

async function getEmails(auth) {
    const gmail = google.gmail({version: 'v1', auth});
    const res = await gmail.users.threads.list({
        userId: 'me',
        q: `is:unread after:${moment().subtract(1, 'days').format('DD/MM/YYYY')} before:${moment().add(1, 'days').format('DD/MM/YYYY')}`
    })
    if(res.data.resultSizeEstimate > 0) {
      await Promise.all(
        res.data.threads.map(async(thread) => {
          const threadData = await gmail.users.threads.get({
            userId: 'me',
            id: thread.id
          })

          for(let message of threadData.data.messages) {
            if(message.labelIds.some(label => label.startsWith('SENT'))) {
              return;
            }
          }
          const replyMessage = 'I am out of town and will be available after 28th Feb';
          const emailData = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
              threadId: threadData.data.id,
              raw: Buffer.from(`From: "Shubham Talan" <${'shubhamtalan3@gmail.com'}>\nTo: ${threadData.data.messages[0].payload.headers.find(header => header.name === 'From').value}\nSubject: Re: ${threadData.data.messages[0].payload.headers.find(header => header.name === 'Subject').value}\n\n${replyMessage}`).toString('base64')
            }
          });
          let label = await checkIfLabelExists(auth, 'Out of Town');
          if(!label) {
            label = await gmail.users.labels.create({
              userId: 'me',
              resource: {
                name: 'Out of Town',
                messageListVisibility: 'show',
                labelListVisibility: 'labelShow'
              }
            })
            label = label.data
          }
          const addLabel = await gmail.users.messages.modify({
            userId: 'me',
            id: emailData.data.id,
            resource: {
              addLabelIds: [label.id]
            }
          })
        })
      )
    }
    return res.data.threads;
}

module.exports = {
    authorize,
    getEmails,
}
