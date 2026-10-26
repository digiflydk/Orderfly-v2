/** Fixed display metadata selected from the immutable quote's routing source.
 * Never accept attribution text, HTML or destination URLs from provider data. */
export type DeliveryRoutingAttribution = Readonly<{
  providerLabel: string;
  providerUrl: string;
  dataLabel: string;
  dataUrl: string;
}>;
const geoapify: DeliveryRoutingAttribution = Object.freeze({
  providerLabel: 'Powered by Geoapify',
  providerUrl: 'https://www.geoapify.com/',
  dataLabel: '© OpenStreetMap contributors',
  dataUrl: 'https://www.openstreetmap.org/copyright',
});
export function deliveryRoutingAttribution(source: unknown): DeliveryRoutingAttribution | null {
  return source === 'geoapify' ? geoapify : null;
}
