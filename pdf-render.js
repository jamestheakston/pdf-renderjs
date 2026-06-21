/**
 * PDF-render.js - Client-side PDF Rendering Library with Annotations
 * Built on top of PDF.js for reliable PDF rendering
 */

class PDFRenderer {
    constructor(options = {}) {
        this.pdfDoc = null;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.scale = options.scale || 1.5;
        this.canvas = options.canvas;
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.annotations = [];
        this.currentAnnotation = null;
        this.annotationMode = null; // 'highlight', 'signature', 'text', 'draw'
        
        // Initialize PDF.js worker
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = options.workerSrc || 
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }

    /**
     * Load a PDF document
     * @param {string|ArrayBuffer|Uint8Array} source - PDF source (URL, ArrayBuffer, or Uint8Array)
     * @returns {Promise<Object>} PDF document info
     */
    async loadDocument(source) {
        try {
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF.js library not loaded. Please include pdf.js script.');
            }

            const loadingTask = pdfjsLib.getDocument(source);
            this.pdfDoc = await loadingTask.promise;
            
            return {
                numPages: this.pdfDoc.numPages,
                info: await this.pdfDoc.getMetadata()
            };
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw error;
        }
    }

    /**
     * Render a specific page
     * @param {number} pageNum - Page number (1-based)
     * @param {HTMLCanvasElement} canvas - Canvas element to render to
     * @returns {Promise<void>}
     */
    async renderPage(pageNum, canvas = this.canvas) {
        if (!this.pdfDoc) {
            throw new Error('No PDF document loaded. Call loadDocument() first.');
        }

        if (pageNum < 1 || pageNum > this.pdfDoc.numPages) {
            throw new Error(`Page ${pageNum} out of range (1-${this.pdfDoc.numPages})`);
        }

        try {
            this.pageRendering = true;
            
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: canvas.getContext('2d'),
                viewport: viewport
            };
            
            const renderTask = page.render(renderContext);
            await renderTask.promise;
            
            this.pageRendering = false;
            
            // Render annotations for this page
            this.renderAnnotations(canvas, pageNum);
            
            return { pageNum, viewport };
        } catch (error) {
            this.pageRendering = false;
            console.error('Error rendering page:', error);
            throw error;
        }
    }

    /**
     * Render all pages
     * @param {HTMLCanvasElement[]|HTMLDivElement} container - Container for canvases or array of canvases
     * @returns {Promise<Array>} Array of rendered page info
     */
    async renderAllPages(container) {
        if (!this.pdfDoc) {
            throw new Error('No PDF document loaded. Call loadDocument() first.');
        }

        const results = [];
        const numPages = this.pdfDoc.numPages;

        for (let i = 1; i <= numPages; i++) {
            let canvas;
            
            if (Array.isArray(container)) {
                canvas = container[i - 1];
            } else if (container instanceof HTMLDivElement) {
                canvas = document.createElement('canvas');
                canvas.className = 'pdf-page';
                container.appendChild(canvas);
            } else {
                throw new Error('Container must be an array of canvases or a div element');
            }
            
            const result = await this.renderPage(i, canvas);
            results.push(result);
        }

        return results;
    }

    /**
     * Set rendering scale
     * @param {number} scale - Scale factor (e.g., 1.0, 1.5, 2.0)
     */
    setScale(scale) {
        this.scale = scale;
    }

    /**
     * Get total number of pages
     * @returns {number}
     */
    getNumPages() {
        return this.pdfDoc ? this.pdfDoc.numPages : 0;
    }

    /**
     * Get PDF document info
     * @returns {Promise<Object>}
     */
    async getDocumentInfo() {
        if (!this.pdfDoc) {
            throw new Error('No PDF document loaded.');
        }
        return await this.pdfDoc.getMetadata();
    }

    // ==================== ANNOTATION METHODS ====================

    /**
     * Set annotation mode
     * @param {string} mode - 'highlight', 'signature', 'text', 'draw', or null
     */
    setAnnotationMode(mode) {
        this.annotationMode = mode;
    }

    /**
     * Add a highlight annotation
     * @param {number} pageNum - Page number
     * @param {Object} rect - Rectangle coordinates {x, y, width, height}
     * @param {string} color - Highlight color (default: yellow)
     * @param {string} comment - Optional comment
     */
    addHighlight(pageNum, rect, color = '#ffff00', comment = '') {
        const annotation = {
            type: 'highlight',
            pageNum,
            rect,
            color,
            comment,
            timestamp: new Date().toISOString()
        };
        this.annotations.push(annotation);
        return annotation;
    }

    /**
     * Add a text annotation
     * @param {number} pageNum - Page number
     * @param {Object} position - Position {x, y}
     * @param {string} text - Annotation text
     * @param {string} color - Text color (default: red)
     */
    addTextAnnotation(pageNum, position, text, color = '#ff0000') {
        const annotation = {
            type: 'text',
            pageNum,
            position,
            text,
            color,
            timestamp: new Date().toISOString()
        };
        this.annotations.push(annotation);
        return annotation;
    }

    /**
     * Add a signature annotation
     * @param {number} pageNum - Page number
     * @param {Object} position - Position {x, y}
     * @param {string} signatureData - Base64 encoded signature image or SVG data
     * @param {string} type - 'image' or 'svg'
     */
    addSignature(pageNum, position, signatureData, type = 'image') {
        const annotation = {
            type: 'signature',
            pageNum,
            position,
            signatureData,
            signatureType: type,
            timestamp: new Date().toISOString()
        };
        this.annotations.push(annotation);
        return annotation;
    }

    /**
     * Add a drawing annotation
     * @param {number} pageNum - Page number
     * @param {Array} points - Array of points [{x, y}, ...]
     * @param {string} color - Stroke color
     * @param {number} lineWidth - Line width
     */
    addDrawing(pageNum, points, color = '#ff0000', lineWidth = 2) {
        const annotation = {
            type: 'drawing',
            pageNum,
            points,
            color,
            lineWidth,
            timestamp: new Date().toISOString()
        };
        this.annotations.push(annotation);
        return annotation;
    }

    /**
     * Render annotations on canvas
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {number} pageNum - Page number
     */
    renderAnnotations(canvas, pageNum) {
        const ctx = canvas.getContext('2d');
        const pageAnnotations = this.annotations.filter(a => a.pageNum === pageNum);

        pageAnnotations.forEach(annotation => {
            switch (annotation.type) {
                case 'highlight':
                    this.renderHighlight(ctx, annotation);
                    break;
                case 'text':
                    this.renderTextAnnotation(ctx, annotation);
                    break;
                case 'signature':
                    this.renderSignature(ctx, annotation);
                    break;
                case 'drawing':
                    this.renderDrawing(ctx, annotation);
                    break;
            }
        });
    }

    /**
     * Render highlight annotation
     */
    renderHighlight(ctx, annotation) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = annotation.color;
        ctx.fillRect(
            annotation.rect.x * this.scale,
            annotation.rect.y * this.scale,
            annotation.rect.width * this.scale,
            annotation.rect.height * this.scale
        );
        ctx.restore();
    }

    /**
     * Render text annotation
     */
    renderTextAnnotation(ctx, annotation) {
        ctx.save();
        ctx.fillStyle = annotation.color;
        ctx.font = '14px Arial';
        ctx.fillText(
            annotation.text,
            annotation.position.x * this.scale,
            annotation.position.y * this.scale
        );
        ctx.restore();
    }

    /**
     * Render signature annotation
     */
    async renderSignature(ctx, annotation) {
        const img = new Image();
        
        if (annotation.signatureType === 'image') {
            img.src = annotation.signatureData;
        } else {
            // Convert SVG to data URL
            const svgBlob = new Blob([annotation.signatureData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            img.src = url;
        }

        img.onload = () => {
            ctx.save();
            ctx.drawImage(
                img,
                annotation.position.x * this.scale,
                annotation.position.y * this.scale,
                200 * this.scale, // Default signature width
                100 * this.scale  // Default signature height
            );
            ctx.restore();
        };
    }

    /**
     * Render drawing annotation
     */
    renderDrawing(ctx, annotation) {
        if (annotation.points.length < 2) return;

        ctx.save();
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = annotation.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(
            annotation.points[0].x * this.scale,
            annotation.points[0].y * this.scale
        );

        for (let i = 1; i < annotation.points.length; i++) {
            ctx.lineTo(
                annotation.points[i].x * this.scale,
                annotation.points[i].y * this.scale
            );
        }

        ctx.stroke();
        ctx.restore();
    }

    /**
     * Get all annotations
     * @returns {Array}
     */
    getAnnotations() {
        return this.annotations;
    }

    /**
     * Get annotations for a specific page
     * @param {number} pageNum - Page number
     * @returns {Array}
     */
    getPageAnnotations(pageNum) {
        return this.annotations.filter(a => a.pageNum === pageNum);
    }

    /**
     * Remove an annotation
     * @param {string} annotationId - Annotation ID (timestamp)
     */
    removeAnnotation(annotationId) {
        this.annotations = this.annotations.filter(a => a.timestamp !== annotationId);
    }

    /**
     * Clear all annotations
     */
    clearAnnotations() {
        this.annotations = [];
    }

    /**
     * Export annotations as JSON
     * @returns {string}
     */
    exportAnnotations() {
        return JSON.stringify(this.annotations, null, 2);
    }

    /**
     * Import annotations from JSON
     * @param {string} json - JSON string
     */
    importAnnotations(json) {
        try {
            this.annotations = JSON.parse(json);
        } catch (error) {
            console.error('Error importing annotations:', error);
            throw error;
        }
    }

    /**
     * Search for text in the PDF
     * @param {string} query - Text to search for
     * @returns {Promise<Array>} Array of search results
     */
    async searchText(query) {
        if (!this.pdfDoc) {
            throw new Error('No PDF document loaded.');
        }

        const results = [];
        
        for (let i = 1; i <= this.pdfDoc.numPages; i++) {
            const page = await this.pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            
            textContent.items.forEach(item => {
                if (item.str.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        pageNum: i,
                        text: item.str,
                        position: {
                            x: item.transform[4],
                            y: item.transform[5]
                        }
                    });
                }
            });
        }

        return results;
    }

    /**
     * Extract text from a page
     * @param {number} pageNum - Page number
     * @returns {Promise<string>} Extracted text
     */
    async extractText(pageNum) {
        if (!this.pdfDoc) {
            throw new Error('No PDF document loaded.');
        }

        const page = await this.pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        return textContent.items.map(item => item.str).join(' ');
    }

    /**
     * Destroy the PDF document and clean up
     */
    destroy() {
        if (this.pdfDoc) {
            this.pdfDoc.destroy();
            this.pdfDoc = null;
        }
        this.annotations = [];
        this.pageRendering = false;
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFRenderer;
} else if (typeof define === 'function' && define.amd) {
    define([], () => PDFRenderer);
} else {
    window.PDFRenderer = PDFRenderer;
}
