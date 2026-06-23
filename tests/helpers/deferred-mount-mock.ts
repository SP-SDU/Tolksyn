const mounts: Array<{
  callback: () => void;
  cancel: jest.Mock;
}> = [];

const scheduleDeferredMount = jest.fn((callback: () => void) => {
  const cancel = jest.fn();
  mounts.push({ callback, cancel });
  return cancel;
});

export const mockDeferredMount = {
  mounts,
  scheduleDeferredMount,
};
