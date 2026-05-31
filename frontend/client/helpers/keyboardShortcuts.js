export const KEYBOARD_SHORTCUT_SECTIONS = [
  {
    title: 'General',
    items: [
      {
        id: 'open-shortcuts',
        label: 'Open keyboard shortcuts',
        description: 'Show the full shortcut reference inside Settings.',
        keys: ['Ctrl/Cmd', '/'],
      },
      {
        id: 'open-settings',
        label: 'Open settings',
        description: 'Jump straight to the Settings panel.',
        keys: ['Ctrl/Cmd', ','],
      },
      {
        id: 'close-current',
        label: 'Close current modal or panel',
        description: 'Dismiss the active modal, panel or selection state.',
        keys: ['Esc'],
      },
    ],
  },
  {
    title: 'Navigation',
    items: [
      {
        id: 'show-chats',
        label: 'Show chat list',
        description: 'Return to the main chat list area.',
        keys: ['Ctrl/Cmd', 'Shift', 'J'],
      },
      {
        id: 'open-calls',
        label: 'Open calls',
        description: 'Switch to the calls panel.',
        keys: ['Ctrl/Cmd', 'Shift', 'L'],
      },
      {
        id: 'open-status',
        label: 'Open status',
        description: 'Open the status updates panel.',
        keys: ['Ctrl/Cmd', 'Shift', 'S'],
      },
      {
        id: 'open-contacts',
        label: 'Open contacts',
        description: 'Open your contact list and new chat panel.',
        keys: ['Ctrl/Cmd', 'Shift', 'C'],
      },
      {
        id: 'open-communities',
        label: 'Open communities',
        description: 'Switch to the communities page.',
        keys: ['Ctrl/Cmd', 'Shift', 'G'],
      },
      {
        id: 'open-archive',
        label: 'Open archive',
        description: 'View archived chats.',
        keys: ['Ctrl/Cmd', 'Shift', 'A'],
      },
      {
        id: 'open-lists',
        label: 'Open lists',
        description: 'Open your custom list view.',
        keys: ['Ctrl/Cmd', 'Shift', 'I'],
      },
      {
        id: 'open-starred',
        label: 'Open starred messages',
        description: 'Jump to starred messages.',
        keys: ['Ctrl/Cmd', 'Shift', 'T'],
      },
      {
        id: 'open-profile',
        label: 'Open profile',
        description: 'Open your profile page.',
        keys: ['Ctrl/Cmd', 'Shift', 'P'],
      },
    ],
  },
  {
    title: 'Messaging',
    items: [
      {
        id: 'focus-search',
        label: 'Focus chat search',
        description: 'Move focus to the chat search field.',
        keys: ['Ctrl/Cmd', 'K'],
      },
      {
        id: 'focus-composer',
        label: 'Focus message composer',
        description: 'Move focus to the current room message box.',
        keys: ['Ctrl/Cmd', 'Shift', 'M'],
      },
      {
        id: 'new-group',
        label: 'Start a new group',
        description: 'Open the new group flow.',
        keys: ['Ctrl/Cmd', 'Shift', 'N'],
      },
      {
        id: 'select-chats',
        label: 'Select chats',
        description: 'Enter bulk chat selection mode.',
        keys: ['Ctrl/Cmd', 'Shift', 'X'],
      },
      {
        id: 'toggle-mute',
        label: 'Toggle mute notifications',
        description: 'Enable or disable muted notifications system-wide.',
        keys: ['Ctrl/Cmd', 'Shift', 'U'],
      },
    ],
  },
];

export const KEYBOARD_SHORTCUT_ITEMS = KEYBOARD_SHORTCUT_SECTIONS.flatMap(
  (section) => section.items
);
