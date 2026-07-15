const gsap = {
  to: () => ({ kill: jest.fn() }),
  fromTo: () => ({ kill: jest.fn() }),
  from: () => ({ kill: jest.fn() }),
  registerPlugin: jest.fn(),
};

export default gsap;
