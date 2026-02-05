module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  // Remove forceExit to let tests cleanup properly
  // forceExit: true,
  detectOpenHandles: false,
  // Ensure all timers are cleared
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};