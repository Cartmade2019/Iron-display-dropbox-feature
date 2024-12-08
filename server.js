require('dotenv').config();

const btoa = require('btoa');
const { Dropbox } = require('dropbox');
const express = require('express');
const logger = require('morgan');
const multer = require('multer');
const fetch = require('node-fetch');
const fs = require('fs');
const querystring = require('querystring');
const cors = require('cors');
const app = express();
const TEAM_MEMBER_ID = process.env.TEAM_MEMBER_ID; // Add this to your .env file

const { YOUR_APP_KEY } = process.env;
const { YOUR_APP_SECRET } = process.env;
const { ACCESS_CODE_FROM_STEP_1 } = process.env;
let { REFRESH_TOKEN } = process.env; // store this token from the first time & then use this token from the DB
let ACCESS_TOKEN = '';
let dbx;
const path = require('path');
const upload = multer({ dest: 'uploads/' });

// Middleware to parse request body
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));
app.use(logger('common', { skip: () => process.env.NODE_ENV === 'test' }));
app.use(cors());
async function getRefreshToken() {
  try {
    const base64authorization = btoa(`${YOUR_APP_KEY}:${YOUR_APP_SECRET}`);
    const response = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${base64authorization}`,
      },
      body: querystring.stringify({
        code: ACCESS_CODE_FROM_STEP_1,
        grant_type: 'authorization_code',
      }),
    });

    const data = await response.json();
    console.log('Refresh Token Response:', data);
    if (!data.error) {
      REFRESH_TOKEN = data.refresh_token;
      console.log('🚀 ~ getRefreshToken ~ REFRESH_TOKEN:', REFRESH_TOKEN);
    }
  } catch (error) {
    console.error('Error getting refresh token:', error);
  }
}

async function refreshAccessToken() {
  try {
    const base64authorization = btoa(`${YOUR_APP_KEY}:${YOUR_APP_SECRET}`);
    const response = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${base64authorization}`,
      },
      body: querystring.stringify({
        refresh_token: REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();
    console.log('Access Token Response:', data);
    ACCESS_TOKEN = data.access_token;
    console.log('🚀 ~ refreshAccessToken ~ ACCESS_TOKEN:', ACCESS_TOKEN);
  } catch (error) {
    console.error('Error refreshing access token:', error);
  }
}

// // POST endpoint to upload a file to Dropbox
// app.post('/upload', upload.single('file'), async (req, res) => {
//     try {
//         await refreshAccessToken();
//         dbx = new Dropbox({ accessToken: ACCESS_TOKEN });
    
//         const { file } = req;
    
//         if (!file) {
//           return res.status(400).send('No file uploaded');
//         }
    
//         const filePath = file.path;
    
//         const response = await dbx.filesUpload({
//           path: `/${file.originalname}`,
//           contents: fs.createReadStream(filePath),
//         });
    
//         const sharedLinkResponse = await dbx.sharingCreateSharedLinkWithSettings({
//           path: `/${file.originalname}`,
//         });
    
//         console.log('Shared Link Response:', sharedLinkResponse);
//         const downloadLink = sharedLinkResponse.result.url;
    
//         await fs.promises.unlink(filePath);
    
//         return res
//           .status(200)
//           .json({ message: 'File uploaded successfully', response, downloadLink });
//       } catch (err) {
//         console.error(err);
//         return res.status(500).json({ message: 'Error uploading file' });
//       }
// });

// try {
//   getRefreshToken();
// } catch (error) {
//   console.log('🚀 ~ getRefreshToken:', error);
// }

// // Start the server
// const PORT = process.env.PORT || 80;
// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

app.post('/api/upload-file', upload.single('file'), async (req, res) => {
    try {
      await refreshAccessToken();
  
      const { file } = req;
  
      if (!file) {
        return res.status(400).send('No file uploaded');
      }
  
      const filePath = file.path;
      // Safely extract original name
    const originalName = file.originalname || 'default-filename';
    console.log('Original file name:', originalName);

    const uniqueFileName = `${Date.now()}_${originalName}`;
    console.log('uniqueFileName',uniqueFileName);
  
      const uploadResponse = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Dropbox-API-Select-User': TEAM_MEMBER_ID,
          'Dropbox-API-Arg': JSON.stringify({
            path: `/${uniqueFileName}`,
            mode: 'add',
            autorename: true,
            mute: false,
            strict_conflict: false,
          }),
          'Content-Type': 'application/octet-stream',
        },
        body: fs.readFileSync(filePath),
      });
  
      const uploadResult = await uploadResponse.json();
  
      if (!uploadResponse.ok) {
        throw new Error(`Error uploading file: ${uploadResult.error_summary}`);
      }
  
      const sharedLinkResponse = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Dropbox-API-Select-User': TEAM_MEMBER_ID,
        },
        body: JSON.stringify({ path: uploadResult.path_lower }),
      });
  
      const sharedLinkResult = await sharedLinkResponse.json();
  
      if (!sharedLinkResponse.ok) {
        throw new Error(`Error creating shared link: ${sharedLinkResult.error_summary}`);
      }
  
      const downloadLink = sharedLinkResult.url.replace('?dl=0', '?dl=1');


      // Clean up local file
      await fs.promises.unlink(filePath);
  
      return res.status(200).json({
        message: 'File uploaded successfully',
        downloadLink,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error uploading file', error: err.message });
    }
    
  });
  
  // Start the server
  const PORT = process.env.PORT || 80;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });