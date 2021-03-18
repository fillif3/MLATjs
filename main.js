const { app, BrowserWindow,ipcMain } = require('electron')
const path = require("path");
const fs = require("fs");

let win;

function createWindow () {
    win = new BrowserWindow({
    width: 1200,
    height: 800,
        fullscreen:true,
    title: "Localization measurnment error - accuracy",
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, "preload.js")
    }



  })

  win.webContents.openDevTools()

  ipcMain.on('request-update-label-in-second-window', (event, arg) => {
    // Request to update the label in the renderer process of the second window
    win.webContents.send('action-update-label', arg);
  });

  win.loadFile('index.html');


}

app.whenReady().then(createWindow)


ipcMain.on("toMain", (event, args) => {
    //fs.writeFile("myfile2.txt", args, (err) => {
    //    if (err) {
    //        //alert("An error ocurred updating the file" + err.message);
    //        console.log(err);
    //    }
    //});
    //alert("The file has been succesfully saved");
    fs.readFile("myfile2.txt", 'utf8',(error, data) => {
    // Do something with file contents
    //for (let i=0;i<3;++i) data[i]+=data[i];
    // Send result back to renderer process



      //var obj = JSON.parse('{ "name":"John", "age":30, "city":"New York"}');

      win.webContents.send("fromMain", data);


  });
});


app.on('window-all-closed', () => {
  const fs = require('fs');
  try { fs.writeFileSync('myfile.txt', 'the text to write in the file', 'utf-8'); }
  catch(e) { alert('Failed to save the file !'); }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
