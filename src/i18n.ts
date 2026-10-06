export type Lang = 'ja' | 'en'

export const dict = {
  ja: {
    app: 'ルーペ',
    lead: '小さな文字を、大きく見る。',
    start: 'カメラをひらく',
    privacy: '映像はこの端末の中だけ。どこにも送りません。',
    zoom: 'ズーム',
    freeze: '止める',
    resume: 'もどす',
    light: 'ライト',
    contrast: ['ふつう', 'くっきり', '白黒反転'],
    contrastLabel: '見え方',
    save: '保存',
    frozenHint: '指でずらして読めます',
    deniedTitle: 'カメラが使えません',
    denied:
      'カメラの使用が許可されていません。ブラウザやスマホの設定で、このページのカメラを「許可」にしてから、もう一度ためしてください。',
    noCamera: 'カメラが見つかりませんでした。',
    busy: 'カメラをほかのアプリが使っているかもしれません。閉じてから、もう一度ためしてください。',
    insecure: 'このページは https で開いてください。',
    unknown: 'カメラを開けませんでした。もう一度ためしてください。',
    retry: 'もう一度',
    toggle: 'English',
  },
  en: {
    app: 'Magnifier',
    lead: 'Read small print with your camera.',
    start: 'Open camera',
    privacy: 'The picture stays on this device. Nothing is sent anywhere.',
    zoom: 'Zoom',
    freeze: 'Freeze',
    resume: 'Resume',
    light: 'Light',
    contrast: ['Normal', 'High contrast', 'Inverted'],
    contrastLabel: 'View',
    save: 'Save',
    frozenHint: 'Drag with a finger to move around',
    deniedTitle: 'Camera not available',
    denied:
      'Camera access was not allowed. Allow the camera for this page in your browser or phone settings, then try again.',
    noCamera: 'No camera was found.',
    busy: 'Another app may be using the camera. Close it and try again.',
    insecure: 'Please open this page over https.',
    unknown: 'Could not open the camera. Please try again.',
    retry: 'Try again',
    toggle: '日本語',
  },
} as const

export type Dict = (typeof dict)[Lang]
