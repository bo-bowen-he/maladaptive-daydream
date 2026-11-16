# Software and research credits

- TensorFlow.js: Apache License 2.0. Bundled license at
  `dist/pix2pix/lib/LICENSE-tfjs.txt`. Project: https://github.com/tensorflow/tfjs.
- ONNX Runtime Web: MIT License. Bundled license at
  `dist/gan/lib/LICENSE-onnxruntime.txt`. Project: https://github.com/microsoft/onnxruntime.
- The pix2pix browser implementation is adapted from the existing project at
  https://github.com/bo-bowen-he/pix2pix-at-home.
- The cloud GAN was trained with the kit at
  https://github.com/bo-bowen-he/GAN-at-home.
- Sleep audio experiments use the RAVE model trained for this project:
  https://github.com/acids-ircam/RAVE. The browser plays rendered audio; it does
  not distribute or execute the RAVE Python or TorchScript implementation.
- The oscillator experiment follows `cycle~` and `nn~` control behavior:
  https://docs.cycling74.com/reference/cycle~/ and
  https://github.com/acids-ircam/nn_tilde.

The creative-content CC BY 4.0 notice does not replace any software license,
imply ownership of third-party code, or grant additional rights in that code.
