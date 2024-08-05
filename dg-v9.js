(async function() {
  // Prompt for API Key before loading the mic icon
  let apiKey = localStorage.getItem('oikey');
  if (!apiKey) {
    apiKey = prompt("Please enter your API key:");
    if (!apiKey) {
      alert("API key is required to proceed.");
      return; // Exit if API key is not provided
    }
    localStorage.setItem('oikey', apiKey);
  }

  // Create and style the mic button
  var micButton = document.createElement('button');
  micButton.id = 'micButton';
  micButton.innerHTML = '🎤';
  micButton.style = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; background-color: white; color: black; border: none; border-radius: 50%; width: 60px; height: 60px; font-size: 24px; cursor: pointer;';
  micButton.draggable = true;
  document.body.appendChild(micButton);

  // Create and style the status div
  var statusDiv = document.createElement('div');
  statusDiv.id = 'status';
  statusDiv.style = 'position: fixed; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px; display: none;';
  document.body.appendChild(statusDiv);

  // Create and style the transcript div
  var transcriptDiv = document.createElement('div');
  transcriptDiv.id = 'transcript';
  transcriptDiv.style = 'position: fixed; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px; max-width: 300px; max-height: 200px; overflow-y: auto; display: none;';
  document.body.appendChild(transcriptDiv);

  // Create and style the intent div
  var intentDiv = document.createElement('div');
  intentDiv.id = 'intent';
  intentDiv.style = 'position: fixed; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px; display: none;';
  document.body.appendChild(intentDiv);

  // Create and style the recording GIF div
  var recordingGifDiv = document.createElement('div');
  recordingGifDiv.id = 'recordingGif';
  recordingGifDiv.style = 'position: fixed; width: 50px; height: 50px; display: none;';
  statusDiv.appendChild(recordingGifDiv);

  // Add the iframe for recording simulation
  var gifIframe = document.createElement('iframe');
  gifIframe.src = 'https://giphy.com/embed/n3PTeKz9qxvVhfGqf0';
  gifIframe.width = '50';
  gifIframe.height = '50';
  gifIframe.style = 'border: none;';
  gifIframe.allowFullscreen = true;
  recordingGifDiv.appendChild(gifIframe);

  console.log('GIF div added:', recordingGifDiv);

  // JavaScript for handling recording, WebSocket connection, and displaying transcript
  let mediaRecorder;
  let socket;
  let fullTranscript = '';
  let isRecording = false;
  let recentConversations = [];

  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function startRecording() {
    statusDiv.textContent = 'Recording...';
    statusDiv.style.display = 'block';
    recordingGifDiv.style.display = 'block';
    console.log('Showing recording GIF');
    micButton.style.backgroundColor = 'black';
    micButton.style.color = 'white';
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      socket = new WebSocket('wss://api.deepgram.com/v1/listen?diarize=true&smart_format=true&redact=pci&redact=ssn&model=nova-2', ['token', 'bf373551459bce132cef3b1b065859ed3e4bac8f']);

      socket.onopen = () => {
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === 1) {
            socket.send(event.data);
          }
        };
        mediaRecorder.start(1000);
        isRecording = true;
      };

      socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        const transcript = received.channel.alternatives[0].transcript;
        const words = received.channel.alternatives[0].words;

        if (transcript && received.is_final) {
          let transcriptText = '';
          let currentSpeaker = null;
          words.forEach(word => {
            if (word.speaker !== currentSpeaker) {
              if (currentSpeaker !== null) {
                transcriptText += '\n';
              }
              currentSpeaker = word.speaker;
              transcriptText += `[Speaker ${currentSpeaker}] `;
            }
            transcriptText += `${word.punctuated_word} `;
          });
          fullTranscript += transcriptText.trim() + '\n';
          recentConversations.push(transcriptText.trim());
          if (recentConversations.length > 2) {
            recentConversations.shift();
          }
          transcriptDiv.textContent = recentConversations.join('\n\n');
          transcriptDiv.style.display = 'block';
        }
      };

      socket.onclose = () => {
        console.log('WebSocket closed');
      };

      socket.onerror = (error) => {
        statusDiv.textContent = 'Error: ' + error.message;
        console.error('WebSocket error:', error);
      };
    }).catch(error => {
      statusDiv.textContent = 'Error accessing media devices';
      console.error('Error accessing media devices:', error);
    });
  }

  function stopRecording() {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    if (socket) {
      socket.close();
    }
    statusDiv.textContent = 'Recording stopped';
    micButton.style.backgroundColor = 'white';
    micButton.style.color = 'black';
    recordingGifDiv.style.display = 'none';
    console.log('Hiding recording GIF');
    isRecording = false;

    // Clear old intent values before storing new ones
    localStorage.removeItem('intent');
     localStorage.removeItem('intent_device');
    localStorage.removeItem('intent_protectionPlan');

    // Call OpenAI API to get intent
    callOpenAiAPI(fullTranscript, apiKey).then((analysisResults) => {
      displayResults(analysisResults);
    });
  }

  // Function to call OpenAI API
  async function callOpenAiAPI(transcript, apiKey) {
    const maxLength = 4096; // Maximum token length for the model

    // Trim the transcript if it's too long
    if (transcript.length > maxLength) {
      transcript = transcript.substring(0, maxLength);
    }

    try {
      // Intent
      const intent = await callOpenAiEndpoint('https://api.openai.com/v1/chat/completions', transcript, apiKey, 'Identify the intent of the following conversation:');
      const devicename = await callOpenAiEndpoint('https://api.openai.com/v1/chat/completions', transcript, apiKey, 'Identify the device name (e.g.,Apple,Samsung) mentioned in the conversation:');
      const protectionplan = await callOpenAiEndpoint('https://api.openai.com/v1/chat/completions', transcript, apiKey, 'Identify the features requested by the customer (e.g., Device protection plan, Travel pass:');
      return {
        intent,
        devicename,
        protectionplan
      };
    } catch (error) {
      console.error('Error during OpenAI API calls:', error);
      return { error: 'Error during OpenAI API calls: ' + error.message };
    }
  }

  // Function to call a specific OpenAI endpoint
  async function callOpenAiEndpoint(url, transcript, apiKey, prompt) {
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: `${prompt}\n\n${transcript}\n\nResponse:` }
        ],
        max_tokens: 150,
        n: 1,
        stop: ['\n']
      })
    };

    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      console.error('Fetch failed:', data);
      throw new Error('Fetch failed');
    }
    return data.choices[0].message.content.trim();
  }

  // Function to display results
  function displayResults(analysis) {
    if (analysis.error) {
      intentDiv.textContent = `Error: ${analysis.error}`;
    } else {
      intentDiv.textContent = `Intent: ${analysis.intent}`;
      localStorage.setItem('intent', analysis.intent);  // Saving intent in local storage
      localStorage.setItem('intent_device', analysis.devicename); 
      localStorage.setItem('intent_protectionPlan', analysis.protectionplan); 
      intentDiv.style.display = 'block';
    }
  }

  // Retrieve and display intent from local storage
  function displayStoredIntent() {
    const storedIntent = localStorage.getItem('intent');
    if (storedIntent) {
      intentDiv.textContent = `Stored Intent: ${storedIntent}`;
      intentDiv.style.display = 'block';
    }
  }

  // Add event listener to the mic button
  micButton.addEventListener('click', toggleRecording);

  // Make the mic button movable and update positions of status, transcript, intent, and recording GIF divs
  micButton.addEventListener('dragstart', function(event) {
    event.dataTransfer.setData('text/plain', null);
    var style = window.getComputedStyle(event.target, null);
    var str = (parseInt(style.getPropertyValue('left'), 10) - event.clientX) + ',' + (parseInt(style.getPropertyValue('top'), 10) - event.clientY);
    event.dataTransfer.setData("Text", str);
  });

  document.body.addEventListener('dragover', function(event) {
    event.preventDefault();
    return false;
  });

  document.body.addEventListener('drop', function(event) {
    var offset = event.dataTransfer.getData("Text").split(',');
    micButton.style.left = (event.clientX + parseInt(offset[0], 10)) + 'px';
    micButton.style.top = (event.clientY + parseInt(offset[1], 10)) + 'px';
    statusDiv.style.left = micButton.style.left;
    statusDiv.style.top = (parseInt(micButton.style.top, 10) + 80) + 'px';
    transcriptDiv.style.left = micButton.style.left;
    transcriptDiv.style.top = (parseInt(statusDiv.style.top, 10) + 60) + 'px';
    intentDiv.style.left = micButton.style.left;
    intentDiv.style.top = (parseInt(transcriptDiv.style.top, 10) + 220) + 'px';
    recordingGifDiv.style.left = statusDiv.style.left;
    recordingGifDiv.style.top = (parseInt(statusDiv.style.top, 10) + 30) + 'px';
    event.preventDefault();
    return false;
  });

  // Display stored intent on page load
 // displayStoredIntent();

})();
