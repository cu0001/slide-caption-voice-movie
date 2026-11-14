"""Regenerate the original demo WAV with Python's standard library, no media tools."""
import math
import struct
import wave
from pathlib import Path
rate = 48000
with wave.open(str(Path(__file__).resolve().parent.parent / 'public' / 'demo.wav'), 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    for n in range(12 * rate):
        t = n / rate
        chord = [220, 277.1826, 329.6276] if t < 4 else [196, 246.9417, 293.6648] if t < 8 else [174.6141, 220, 261.6256]
        envelope = min(t / .1, 1) * min((12 - t) / .5, 1) * (.65 + .35 * math.sin(math.pi * (t % 2) / 2) ** 2)
        value = sum(math.sin(2 * math.pi * f * t) for f in chord) / 3 * .14 * envelope
        w.writeframesraw(struct.pack('<h', int(value * 32767)))
