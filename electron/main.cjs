const { app, BrowserWindow } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

async function startServer() {
  // ESM modulunu dinamik olarak ice aktariyoruz.
  try {
    const serverPath = path.join(__dirname, '..', 'dist', 'src', 'server.js');
    const fileUrl = require('url').pathToFileURL(serverPath).href;
    await import(fileUrl);
    console.log("Server basariyla baslatildi.");
  } catch (err) {
    console.error("Server baslatilirken hata olustu:", err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'OtoAsistan',
    icon: path.join(__dirname, '..', 'build', 'icon.png')
  });

  mainWindow.setMenuBarVisibility(false);

  const checkServer = () => {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      setTimeout(checkServer, 1000);
    });
  };
  checkServer();

  autoUpdater.checkForUpdatesAndNotify();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on('activate', function () {
    if (mainWindow === null) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

autoUpdater.on('update-available', () => {
  console.log('Guncelleme bulundu, indiriliyor...');
});
autoUpdater.on('update-downloaded', () => {
  console.log('Guncelleme indirildi, yeniden baslatiliyor...');
  autoUpdater.quitAndInstall();
});
