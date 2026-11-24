import * as settings from '../settings.js';

export function stemsEnabled(): boolean {
  return settings.get()?.transitions?.stemsEnabled !== false;
}

export function newStyleStemsSelected(): boolean {
  return settings.get()?.transitions?.stemsStyle === 'new-style';
}

export function regularStemWorkingMode(): boolean {
  return stemsEnabled() && newStyleStemsSelected();
}

export function regularStemBlendsEnabled(): boolean {
  const transitions = settings.get()?.transitions;
  return transitions?.stemsEnabled !== false && (transitions?.stemsStyle === 'new-style'
    ? transitions?.newStyleStemBlends === true
    : transitions?.stemBlends === true);
}

export function stemBeatsEnabled(): boolean {
  const transitions = settings.get()?.transitions;
  return transitions?.stemsEnabled !== false && transitions?.stemsStyle === 'new-style'
    && transitions?.newStyleStemBeats === true;
}
