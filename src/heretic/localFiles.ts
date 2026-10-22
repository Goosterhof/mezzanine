/** Only explicit POSIX paths from the laboratory; native code enforces containment. */
export function localFilePath(reference: string): string | null {
    let path: string;
    try {
        path = decodeURIComponent(reference).replace(/:\d+(?::\d+)?$/, '');
    } catch {
        return null;
    }
    // Control characters cannot be part of a native file reference.
    // oxlint-disable-next-line no-control-regex
    if (!path.startsWith('/') || path.includes('//') || /[\\\u0000-\u001f\u007f:?#<>"|*]/.test(path)) return null;
    if (path.split('/').some((part) => part === '.' || part === '..')) return null;
    return path;
}

export function imageMime(path: string): string | null {
    const extension = path.split('.').pop()?.toLowerCase() ?? '';
    switch (extension) {
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'webp':
            return 'image/webp';
        case 'gif':
            return 'image/gif';
        default:
            return null;
    }
}
