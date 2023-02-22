const { authorize, getEmails} = require('./gmail-crawler')

function startApp() {
    setInterval(async () => {
        const auth = await authorize();
        await getEmails(auth);
    }, 45000)
}
startApp()