import io
import os
import unittest
import wave
from unittest.mock import patch
from fastapi.testclient import TestClient
import server


def wav(rate=16000, frames=8000):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        audio.writeframes(b"\x00\x00" * frames)
    return output.getvalue()


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)
        self.token = "test-token-only-" + "x" * 32
        self.headers = {"Authorization": "Bearer " + self.token, "Content-Type": "audio/wav"}
        self.env = patch.dict(os.environ, {"WHISPER_SERVICE_TOKEN": self.token})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_rejects_unauthenticated_and_invalid_audio(self):
        self.assertEqual(self.client.post('/transcribe', content=wav()).status_code, 401)
        self.assertEqual(self.client.post('/transcribe', headers=self.headers, content=wav(rate=8000)).status_code, 400)
        self.assertEqual(self.client.post('/transcribe', headers=self.headers, content=b'x' * 640045).status_code, 413)
        self.assertEqual(self.client.post('/transcribe', headers=self.headers, content=wav()[:-20]).status_code, 400)

    def test_valid_audio_reaches_model_and_text_returns(self):
        with patch.object(server, 'model', object()), patch.object(server, 'transcribe', return_value={"text": "Hello Mira", "language": "en", "engine": "faster-whisper"}) as transcribe:
            result = self.client.post('/transcribe?language=en', headers=self.headers, content=wav())
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()['text'], 'Hello Mira')
            self.assertEqual(len(transcribe.call_args.args[0]), 8000)


if __name__ == '__main__':
    unittest.main()
