(async function() {
  const awsAccessKeyId = prompt('Enter your AWS Access Key ID:');
  const awsSecretAccessKey = prompt('Enter your AWS Secret Access Key:');
  const awsRegion = 'YOUR_AWS_REGION'; // Replace with your AWS region

  // Initialize AWS SDK
  AWS.config.update({
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
    region: awsRegion
  });

  const transcribeClient = new AWS.TranscribeStreamingClient();

  const controlsDiv = document.createElement('div');
  controlsDiv.id = 'controls';
  controlsDiv.style = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px;';
  document.body.appendChild(controlsDiv);

  const startButton = document.createElement('button');
  startButton.id = 'startButton';
  startButton.innerText = 'Start Recording';
  startButton.style = 'margin-right: 5px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
  controlsDiv.appendChild(startButton);

  const stopButton = document.createElement('button');
  stopButton.id = 'stopButton';
  stopButton.innerText = 'Stop Recording';
  stopButton.style = 'margin-right: 5px; padding: 5px 10px; background-color: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;';
  stopButton.disabled = true;
  controlsDiv.appendChild(stopButton);

  const statusDiv = document.createElement('div');
  statusDiv.id = 'status';
  statusDiv.innerText = 'Status: Not Connected';
  statusDiv.style = 'margin-top: 10px; padding: 5px; background-color: lightgray;';
  controlsDiv.appendChild(statusDiv);

  const transcriptDiv = document.createElement('div');
  transcriptDiv.id = 'transcript';
  transcriptDiv.style = 'margin-top: 10px; white-space: pre-wrap; word-wrap: break-word; height: 400px; max-height: 1400px; width: 1000px; overflow-y: scroll; border: 1px solid black; padding: 5px;';
  controlsDiv.appendChild(transcriptDiv);

  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'results';
  resultsDiv.style = 'margin-top: 10px; padding: 5px;';
  controlsDiv.appendChild(resultsDiv);

  let mediaRecorder;
  let transcribeStream;
  let fullTranscript = '';

  async function startRecording() {
    statusDiv.textContent = 'Status: Connecting...';
    navigator.mediaDevices.getUserMedia({ audio: true }).then(async (stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      const mediaStream = new ReadableStream({
        start(controller) {
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              controller.enqueue(event.data);
            }
          };
        },
        cancel() {
          mediaRecorder.stop();
        }
      });

      transcribeStream = transcribeClient.startStreamTranscription({
        LanguageCode: 'en-US',
        MediaSampleRateHertz: 44100,
        MediaEncoding: 'pcm',
        AudioStream: mediaStream
      });

      startButton.disabled = true;
      stopButton.disabled = false;
      statusDiv.textContent = 'Status: Connected';

      for await (const event of transcribeStream) {
        if (event.TranscriptEvent) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            if (!result.IsPartial) {
              const transcript = result.Alternatives[0].Transcript;
              fullTranscript += transcript + '\n';
              transcriptDiv.textContent += transcript + '\n';
            }
          }
        }
      }
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
    if (transcribeStream) {
      transcribeStream.abort();
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    statusDiv.textContent = 'Status: Not Connected';

    const promptDiv = document.createElement('div');
    promptDiv.id = 'prompt';
    promptDiv.style = 'margin-top: 10px; padding: 5px; border: 1px solid black; border-radius: 3px;';
    promptDiv.innerHTML = `
      <label for="apiKeyInput">Enter OpenAI API Key:</label>
      <input type="text" id="apiKeyInput" placeholder="API Key" style="margin-left: 5px; padding: 5px; border: 1px solid black; border-radius: 3px;">
      <button id="proceedButton" style="margin-left: 5px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;">Proceed</button>
    `;
    resultsDiv.appendChild(promptDiv);

    document.getElementById('proceedButton').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKeyInput').value;
      if (!apiKey) {
        alert('Please enter the OpenAI API key');
        return;
      }

      const analysisResults = await callOpenAiAPI(fullTranscript, apiKey);
      displayResults(analysisResults);
      promptDiv.remove();
    });
  }

  async function callOpenAiAPI(transcript, apiKey) {
    const maxLength = 4096;

    if (transcript.length > maxLength) {
      transcript = transcript.substring(0, maxLength);
    }

    try {
      const summary = await callOpenAiEndpoint('https://api.openai.com/v1/chat/completions', transcript, apiKey, 'Summarize the following conversation:');
      const intent = await callOpenAiEndpoint('https://api.openai.com/v1/chat/completions', transcript, apiKey, 'Identify the intent of the following conversation:');
      return { summary, intent };
    } catch (error) {
      console.error('Error during OpenAI API calls:', error);
      return { error: 'Error during OpenAI API calls: ' + error.message };
    }
  }

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

  function displayResults(analysis) {
    const resultsBox = document.createElement('div');
    resultsBox.style = 'border: 1px solid black; padding: 10px; margin-top: 10px;';

    const resultsTitle = document.createElement('h3');
    resultsTitle.textContent = 'Analysis Results:';
    resultsBox.appendChild(resultsTitle);

    if (analysis.error) {
      const errorContent = document.createElement('p');
      errorContent.textContent = `Error: ${analysis.error}`;
      resultsBox.appendChild(errorContent);
    } else {
      const summaryContent = document.createElement('p');
      summaryContent.textContent = `Summary: ${analysis.summary}`;
      summaryContent.className = 'summary';
      resultsBox.appendChild(summaryContent);

      const intentContent = document.createElement('p');
      intentContent.textContent = `Intent: ${analysis.intent}`;
      intentContent.className = 'intent';
      resultsBox.appendChild(intentContent);
    }

    resultsDiv.appendChild(resultsBox);
  }

  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
})();
