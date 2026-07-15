import React from 'react';

const Link = ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: any }) =>
  React.createElement('a', { href, ...props }, children);

export default Link;
