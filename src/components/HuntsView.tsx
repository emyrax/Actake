import React from 'react';
import { GeoDropsWorkspace, GeoDropsWorkspaceProps } from './hunts/GeoDropsWorkspace';

export const HuntsView: React.FC<GeoDropsWorkspaceProps> = (props) => {
  return <GeoDropsWorkspace {...props} />;
};
