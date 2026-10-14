import {invoke} from '@tauri-apps/api/core';
import {openUrl} from '@tauri-apps/plugin-opener';
import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import ServiceList from '../../src/holotable/ServiceList.vue';
import {useServiceMonitor} from '../../src/holotable/useServiceMonitor';

vi.mock('@tauri-apps/plugin-opener', () => ({openUrl: vi.fn<typeof openUrl>()}));
const ping = {
    slug: 'parlour',
    label: 'The Parlour',
    url: 'https://example.test/up',
    healthy: true,
    statusCode: 200,
    responseTimeMs: 20,
    error: '',
};
describe('service evidence', () => {
    beforeEach(() => {
        useServiceMonitor().reset();
        vi.mocked(invoke).mockReset();
        vi.mocked(openUrl).mockReset();
    });
    afterEach(() => useServiceMonitor().reset());
    it('starts unknown, shows measured health, and exposes endpoint failures without losing evidence', async () => {
        const wrapper = mount(ServiceList);
        expect(wrapper.text()).toContain('Waiting for the first measurements');
        vi.mocked(invoke).mockResolvedValue({experiments: [ping]});
        await wrapper.get('button').trigger('click');
        await flushPromises();
        expect(wrapper.get('[data-health]').text()).toBe('Healthy');
        await wrapper.get('article button').trigger('click');
        expect(wrapper.text()).toContain('HTTP 200');
        vi.mocked(openUrl).mockRejectedValueOnce(new Error('No browser available'));
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Open health endpoint')!
            .trigger('click');
        await flushPromises();
        expect(openUrl).toHaveBeenCalledWith(ping.url);
        expect(wrapper.text()).toContain('No browser available');
        vi.mocked(invoke).mockRejectedValueOnce(new Error('Bridge offline'));
        await useServiceMonitor().refresh();
        await flushPromises();
        expect(wrapper.get('[data-health]').text()).toBe('Unknown');
        expect(wrapper.text()).toContain('Monitor unavailable');
        expect(wrapper.text()).toContain('HTTP 200');
        wrapper.unmount();
    });
    it('distinguishes an HTTP failure, an unreachable host and stale readings', async () => {
        vi.mocked(invoke).mockResolvedValue({experiments: [{...ping, healthy: false, statusCode: 503}]});
        const monitor = useServiceMonitor();
        await monitor.refresh();
        const wrapper = mount(ServiceList);
        expect(wrapper.get('[data-health]').text()).toBe('Unhealthy');
        vi.mocked(invoke).mockResolvedValue({
            experiments: [{...ping, healthy: false, statusCode: null, error: 'Timed out'}],
        });
        await monitor.refresh();
        await flushPromises();
        expect(wrapper.get('[data-health]').text()).toBe('Unreachable');
        expect(monitor.notice.value).toContain('this computer');
        await wrapper.get('article button').trigger('click');
        expect(wrapper.text()).toContain('Timed out');
        expect(wrapper.text()).toContain('2 consecutive failures');
        monitor.now.value += 151000;
        await flushPromises();
        expect(wrapper.get('[data-health]').text()).toBe('Unknown');
        expect(wrapper.text()).toContain('Last readings are stale');
        wrapper.unmount();
    });
});
