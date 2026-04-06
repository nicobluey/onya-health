import { useEffect } from 'react';

const MAGNETIC_SELECTOR = 'button, a.inline-flex[class*="rounded"], [data-magnetic="true"]';
const DEFAULT_STRENGTH = 0.38;
const MIN_STRENGTH = 0.12;
const MAX_STRENGTH = 0.7;
const DEFAULT_RADIUS = 88;
const MIN_RADIUS = 40;
const MAX_RADIUS = 180;

type MagneticHandlers = {
    onPointerMove: (event: PointerEvent) => void;
    onPointerLeave: () => void;
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function resetMagneticOffset(element: HTMLElement) {
    element.style.setProperty('--lw-mx', '0px');
    element.style.setProperty('--lw-my', '0px');
}

function isMagneticTargetEnabled(element: HTMLElement) {
    if (element.dataset.noMagnetic === 'true') return false;
    if (element.dataset.lightswindMagnetic === 'true') return false;
    if (element.getAttribute('aria-disabled') === 'true') return false;
    if (element instanceof HTMLButtonElement && element.disabled) return false;
    return true;
}

function getMagneticStrength(element: HTMLElement) {
    const requestedStrength = Number.parseFloat(element.dataset.magneticStrength || '');
    if (!Number.isFinite(requestedStrength)) return DEFAULT_STRENGTH;
    return clamp(requestedStrength, MIN_STRENGTH, MAX_STRENGTH);
}

function getMagneticRadius(element: HTMLElement) {
    const requestedRadius = Number.parseFloat(element.dataset.magneticRadius || '');
    if (!Number.isFinite(requestedRadius)) return DEFAULT_RADIUS;
    return clamp(requestedRadius, MIN_RADIUS, MAX_RADIUS);
}

function applyMagneticOffset(element: HTMLElement, clientX: number, clientY: number) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distX = clientX - centerX;
    const distY = clientY - centerY;
    const distance = Math.sqrt(distX ** 2 + distY ** 2);
    const radius = getMagneticRadius(element);

    if (distance >= radius) {
        resetMagneticOffset(element);
        return;
    }

    const strength = getMagneticStrength(element);
    const offsetX = distX * strength;
    const offsetY = distY * strength;

    element.style.setProperty('--lw-mx', `${offsetX.toFixed(2)}px`);
    element.style.setProperty('--lw-my', `${offsetY.toFixed(2)}px`);
}

export function useGlobalMagneticButtons() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const registeredTargets = new Map<HTMLElement, MagneticHandlers>();

        const unregisterTarget = (element: HTMLElement) => {
            const handlers = registeredTargets.get(element);
            if (!handlers) return;

            element.removeEventListener('pointermove', handlers.onPointerMove);
            element.removeEventListener('pointerleave', handlers.onPointerLeave);
            element.removeEventListener('pointercancel', handlers.onPointerLeave);
            element.classList.remove('lw-magnetic-ready');
            resetMagneticOffset(element);
            registeredTargets.delete(element);
        };

        const registerTarget = (element: HTMLElement) => {
            if (registeredTargets.has(element)) return;
            if (element.dataset.noMagnetic === 'true') return;
            if (element.dataset.lightswindMagnetic === 'true') return;

            element.classList.add('lw-magnetic-ready');

            const onPointerMove = (event: PointerEvent) => {
                if (event.pointerType && event.pointerType !== 'mouse') return;
                if (!isMagneticTargetEnabled(element)) {
                    resetMagneticOffset(element);
                    return;
                }

                applyMagneticOffset(element, event.clientX, event.clientY);
            };

            const onPointerLeave = () => {
                resetMagneticOffset(element);
            };

            element.addEventListener('pointermove', onPointerMove);
            element.addEventListener('pointerleave', onPointerLeave);
            element.addEventListener('pointercancel', onPointerLeave);
            registeredTargets.set(element, { onPointerMove, onPointerLeave });
        };

        const registerNodeTree = (node: Node) => {
            if (!(node instanceof Element)) return;

            if (node.matches(MAGNETIC_SELECTOR) && node instanceof HTMLElement) {
                registerTarget(node);
            }

            node.querySelectorAll<HTMLElement>(MAGNETIC_SELECTOR).forEach(registerTarget);
        };

        const unregisterNodeTree = (node: Node) => {
            if (!(node instanceof Element)) return;

            if (node instanceof HTMLElement) {
                unregisterTarget(node);
            }

            node.querySelectorAll<HTMLElement>(MAGNETIC_SELECTOR).forEach(unregisterTarget);
        };

        registerNodeTree(document.body);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach(registerNodeTree);
                mutation.removedNodes.forEach(unregisterNodeTree);
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            Array.from(registeredTargets.keys()).forEach(unregisterTarget);
        };
    }, []);
}
