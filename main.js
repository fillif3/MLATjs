const { app, BrowserWindow,ipcMain } = require('electron')
const path = require("path");
const fs = require("fs");

let win;

function createWindow () {
    win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Localization measurnment error - accuracy",
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, "preload.js")
    }



  })

    win.maximize();

  win.webContents.openDevTools()

  ipcMain.on('request-update-label-in-second-window', (event, arg) => {
    // Request to update the label in the renderer process of the second window
    win.webContents.send('action-update-label', arg);
  });

  win.loadFile('index.html');


}

app.whenReady().then(createWindow)


ipcMain.on("toMain", (event, args) => {

    //alert("The file has been succesfully saved");
    if (args[0]=='load') {
        fs.readFile(args[1], 'utf8', (err, data) => {
            // Do something with file contents
            //for (let i=0;i<3;++i) data[i]+=data[i];
            // Send result back to renderer process
            if (err!=null) {
                win.webContents.send("fromMain", ['error']);
                return null;

            }
            //var obj = JSON.parse('{ "name":"John", "age":30, "city":"New York"}');

            win.webContents.send("fromMain", ['load',data]);


        });
    } else if (args[0]=='save'){
        console.log(args[1],args[2])
        fs.writeFile(args[1],args[2], (err) => {
            console.log('save')
           if (err!=null) {
               console.log('saveerr')
                //alert("An error ocurred updating the file" + err.message);
               win.webContents.send("fromMain", ['error']);
               return null;

           }
            console.log('save')
        });
       // alert("The file has been succesfully saved");

    } else if (args[0]=='check'){
        fs.readdir('saves/', (err, files) => {
            if (err!=null){
                win.webContents.send("fromMain", ['error']);
                return null;
            }
            win.webContents.send("fromMain", ['check',files]);
        });
        // alert("The file has been succesfully saved");

    } else if (args[0]=='delete'){
        try {
            fs.unlinkSync(args[1])
            //file removed
        } catch(err) {
            win.webContents.send("fromMain", ['error']);
        }
    } else if (args[0]=='exit'){
        app.quit()
    } else if (args[0]=='test'){
        win.webContents.send("fromMain", ['test']);
    }

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
