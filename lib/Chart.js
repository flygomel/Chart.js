export default class Chart {
	constructor(el, options) {
		this.el = typeof el == "string" ? this.q(el) : el;
		this.options = {...{
			classPrefix: 'chart',
			mode: 'night',
		}, ...options};
		this.padding = [
			{
				vertical: 46,
				horizontal: 24,
				bottom: 20
			},
			{
				vertical: 8,
				horizontal: 0,
				bottom: 0
			}
		];
		this.setMode(this.options.mode);
		this.addStyle();
		return this;
	}

	addStyle() {
		let node = document.createElement('style');
	    node.innerHTML = style(this.options.classPrefix);
	    document.head.appendChild(node);
	}

	render(idx, params) {

			let chart = this.charts[idx];
			chart.scaleInactiveLeft.style.width = `${chart.params.offset[0] * 100}%`;
			chart.scaleInactiveRight.style.width = `${(1 - chart.params.offset[1]) * 100}%`;


			if(chart.params.last_y == undefined)
				chart.params.last_y = chart.params.max_y;

			if(chart.params.cur_y == undefined) {
				chart.params.new_axis_opacity = 1;
				chart.params.cur_y = chart.params.max_y;
			}

			if(chart.params.last_y != chart.params.max_y) {
				chart.params.last_max_bb = chart.params.cur_max_bb;
				chart.params.new_axis_opacity = 0;
				cancelAnimationFrame(chart.params.anim);
				chart.params.anim = this.animateValue(chart.params.cur_y, chart.params.max_y, (val, p, done) => {
					chart.params.cur_y = val;
					chart.params.new_axis_opacity = p;
					chart.params.anim = requestAnimationFrame(() => {
						this.render(idx);
					})
				}, 300);
				chart.params.last_y = chart.params.max_y;
			}

			this.clearCanvas(idx);
			this.drawAxis(idx, chart.params.offset, chart.params.cur_y, 1);	

			Object.entries(this.data[idx].types).forEach(type => {
				if(type[1] == 'x')
					return;
				this.drawLine(idx, 0, type[0], chart.params.offset, chart.params.cur_y, chart.params.opacity[type[0]]);
				this.drawLine(idx, 1, type[0], null, null, chart.params.opacity[type[0]]);
			});
	}

	easeInOut(t){
		return t*t;
	}

	toggle(idx, name) {
		let visible = !this.charts[idx].params.visible[name],
			opacity = this.charts[idx].params.opacity[name],
			visible_count = 0;
		Object.values(this.charts[idx].params.visible).forEach(v => {
			v && visible_count++;
		});
		if(!visible && visible_count == 1)
			return 1;
		this.animateValue(opacity, visible ? 1 : 0, val => {
			this.charts[idx].params.opacity[name] = parseFloat(val.toFixed(2));
			requestAnimationFrame(() => {
				this.render(idx);
			})
		}, 300);
		this.charts[idx].params.visible[name] = visible;
		return visible ? 1 : 0;
	}

	animateValue(from, to, fn, ms = 300) {
		let start = performance.now();
		requestAnimationFrame(function anim(timestamp) {
			let progress = timestamp - start,
				p = progress / ms;
			if(p < 0)
				p = 0;
			if(p > 1)
				p = 1;
			p = this.easeInOut(p);
			let val = from + (to - from) * p;
			let done = progress > ms;
			fn(val, p, done);
			!done && requestAnimationFrame(anim.bind(this));
		}.bind(this));
	}

	animate(timestamp) {
		if(!this.animationStart)
			this.animationStart = performance.now();
		var progress = timestamp - this.animationStart;
		requestAnimationFrame(this.animate.bind(this));
	}

	getBB(idx, offset) {
		let data = this.data[idx].columns,
			bb = {
				x: {},
				y: {}
			};

		data.forEach(column => {
			column = [...column];
			let axis = column.shift(),
				min = Math.min(...column),
				max = Math.max(...column);
			if(axis == "x") {
				bb.x.min = min;
				bb.x.max = max;
			}
		});
		bb.x.high = bb.x.max - bb.x.min;
		if(offset) {
			bb.x.max = bb.x.min + bb.x.high * offset[1];
			bb.x.min = bb.x.min + bb.x.high * offset[0];
			bb.x.high = bb.x.max - bb.x.min;
		}
		let x_idx = {};
		data.forEach(column => {
			column = [...column];
			let axis = column.shift();
			if(axis == "x") {
				x_idx.max_length = column.length;
				 column.forEach((timestamp, idx) => {
				 	if(timestamp >= bb.x.min)
				 		x_idx.min = x_idx.min === undefined ? idx : Math.min(x_idx.min, idx);
				 	if(timestamp <= bb.x.max)
				 		x_idx.max = x_idx.max === undefined ? idx : Math.max(x_idx.max, idx);
				 });
			}
		});
		if(x_idx.min > x_idx.max)
			x_idx.max = x_idx.min;
		x_idx.min && x_idx.min--;
		x_idx.max != x_idx.max_length - 1 && x_idx.max++;

		data.forEach(column => {
			column = [...column];
			let axis = column.shift();
			if(axis != "x") {
				if(!this.charts[idx].params.visible[axis])
					return;

				column = [...column.splice(x_idx.min, x_idx.max - x_idx.min + 1)];
				let min = Math.min(...column),
					max = Math.max(...column);

		 		bb.y.min = bb.y.min === undefined ? min : Math.min(bb.y.min, min);
		 		bb.y.max = bb.y.max === undefined ? max : Math.max(bb.y.max, max);
			}
		});

		bb.y.min = 0;

		bb.y.high = bb.y.max - bb.y.min;
		return bb;
	}

	clearCanvas(idx) {
		this.charts[idx].canvasCtx.forEach((ctx, canvas_idx) => {
			let canvas = this.charts[idx].canvas[canvas_idx];
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		})
	}

	drawLine(idx, canvas_idx, axis_id, offset, max_y, opacity = 1) {
		let bb = this.getBB(idx, offset),
			chart = this.charts[idx],
			data = this.data[idx],
			canvas = chart.canvas[canvas_idx],
			ctx = chart.canvasCtx[canvas_idx];
		
		max_y = max_y ? max_y : bb.y.max;

		ctx.lineWidth = 4;
		ctx.lineJoin = "round";

		data.columns.forEach(column => {
			column = [...column];
			let axis = column.shift();
			if(axis_id == axis) {
				let pathStarted = false;
				ctx.beginPath();
				ctx.strokeStyle = data.colors[axis] + parseInt(opacity * 255).toString(16).padStart(2, "0");

				column.forEach((dy, idx) => {
					let py = 1 - (dy - bb.y.min) / (max_y - bb.y.min),
						cy = this.padding[canvas_idx].vertical + (chart.canvas[canvas_idx].height - this.padding[canvas_idx].vertical * 2 - this.padding[canvas_idx].bottom) * py,
						px = (data.columns[0][idx + 1] - bb.x.min) / bb.x.high,
						cx = this.padding[canvas_idx].horizontal + (chart.canvas[canvas_idx].width - this.padding[canvas_idx].horizontal * 2) * px;

					if(!pathStarted) {
						ctx.moveTo(cx, cy);
						pathStarted = true;
					} else
						ctx.lineTo(cx, cy);
				});
				ctx.stroke();
			}
		});
	}

	drawAxis(idx, offset, max_y, opacity, max_bb) {
		let bbAll = this.getBB(idx),
			bb = this.getBB(idx, offset),
			chart = this.charts[idx],
			data = this.data[idx],
			canvas = chart.canvas[0],
			ctx = chart.canvasCtx[0],
			min_height = 430,
			min_width = 200,
			min_step = 86400 * 1000;
		opacity = opacity !== undefined ? parseInt(opacity * 255).toString(16).padStart(2, "0") : "00";
		bb.y.max = max_bb ? max_bb : bb.y.max;
		max_y = max_y ? max_y : bb.y.max;
		ctx.lineWidth = 4;
		ctx.lineJoin = "round";
		ctx.font = "24px Roboto";
		ctx.fillStyle = (this.mode =="night" ? "#546778" : "#96a2aa" ) + opacity;
		ctx.strokeStyle = (this.mode =="night" ? "#293544" : "#f2f4f5" ) + opacity;
		ctx.beginPath();
		ctx.textAlign = "start";
		ctx.textBaseline = "bottom";

		let chartHeight = chart.canvas[0].width - this.padding[0].vertical * 2,
			partsCountY = 5,
			pow = parseInt(bb.y.high / partsCountY),
			round = Math.pow(10, pow.toString().length - 1);
		pow = parseInt(pow / round) * round;
		let stepY = this.nearestPow(bb.y.high / partsCountY, pow);
		this.charts[idx].params.max_y = bb.y.max;
		for(let i = bb.y.min;i <= bb.y.max;i = i + stepY) {
			let py = 1 - (i - bb.y.min) / (max_y - bb.y.min),
				y = this.padding[0].vertical + (canvas.height - this.padding[0].vertical * 2  - this.padding[0].bottom) * py,
				val = bb.y.high * (1 - py);
			
			ctx.moveTo(this.padding[0].horizontal, y);
			ctx.lineTo(canvas.width - this.padding[0].horizontal, y);
			ctx.fillText(i, this.padding[0].horizontal, y);
		}

		ctx.textAlign = "center";
		ctx.textBaseline = "top";

		let chartWidth = chart.canvas[0].width - this.padding[0].horizontal * 2,
			labelsPadding = 40,
			chartWidthForLabels = chartWidth - labelsPadding * 2,
			partsCount = parseInt(chartWidth / min_width),
			step = this.nearestPow(bb.x.high / partsCount);
		
		step = this.round(step, min_step);
		for(let i = parseInt(bbAll.x.max - this.round(bbAll.x.max - bb.x.max, step) + step);i >= parseInt(bb.x.min - step);i = i - step) {
			var px = (i - bb.x.min) / bb.x.high,
				cx = this.padding[0].horizontal + chartWidth * px,
				cxl = this.padding[0].horizontal + labelsPadding + chartWidthForLabels * px;

			let date = new Date(i),
				month = date.toLocaleString('en-us', { month: 'short' }),
				day = date.getDate();

			ctx.fillText(`${month} ${day}`, cxl, canvas.height - this.padding[0].vertical);
		}
		ctx.stroke();

		return bb.y.max;
	}

	round(x, m) {
		return Math.ceil(x / m) * m;
	}

	nearestPow(x, pow = 2) {
  		return Math.pow( pow, Math.round( Math.log( x ) / Math.log( pow ) ) ); 
  	}

	renderHtml() {
		this.charts = [];
		this.el.innerHTML = this.data.map((chart, idx) => tpl(chart, idx, this.options.classPrefix)).join("");
		let prefix = this.options.classPrefix;
		this.qa(`.${prefix}`, this.el).forEach((chartEl, idx) => {
			let canvas = this.qa("canvas", chartEl),
				visible = {},
				opacity = {};
			Object.keys(this.data[idx].names).forEach(name => {
				visible[name] = true;
				opacity[name] = 1;
			});
			canvas.forEach(el => {
				el.width = el.parentElement.offsetWidth * 2;
				el.height = el.parentElement.offsetHeight * 2;
			});
			this.charts.push({
				el: chartEl,
				canvas: canvas,
				canvasCtx: [canvas[0].getContext("2d"), canvas[1].getContext("2d")],
				popup: this.q(`.${prefix}-popup`, chartEl),
				names: this.qa(`.${prefix}-legend>div`, chartEl),
				scale: this.q(`.${prefix}-scale`, chartEl),
				scaleZone: this.q(`.${prefix}-scale-zone`, chartEl),
				scaleLeft: this.q(`.${prefix}-scale-zone div:first-child`, chartEl),
				scaleRight: this.q(`.${prefix}-scale-zone div:last-child`, chartEl),
				scaleInactiveLeft: this.q(`.${prefix}-scale-inactive:first-of-type`, chartEl),
				scaleInactiveRight: this.q(`.${prefix}-scale-inactive:last-of-type`, chartEl),
				params: {
					offset: [0.5, 0.9],
					visible,
					opacity,
					max_value: [200, 200],
					axis: {}
				}
			});
			this.render(idx);
		});
		this.initListeners();
	}

	initListeners() {
		let touchStart = e => {
				idx = parseInt(e.target.closest(".chart").getAttribute("idx"));
				startX = e.touches ? e.touches[0].screenX : e.screenX;
				startScaleOffset = this.charts[idx].params.offset;

				mode = 0;
				document.body.style.cursor = "pointer";
				if(e.target == this.charts[idx].scaleLeft) {
					mode = -1;
					document.body.style.cursor = "w-resize";
				}
				if(e.target == this.charts[idx].scaleRight) {
					mode = 1;
					document.body.style.cursor = "e-resize";
				}
			},
			idx = false,
			startX,
			startScaleOffset,
			mode;

		this
			.on('touchmove mousemove', document, e => { 
				if(idx === false)
					return;

				let chart = this.charts[idx],
					offsetX = (e.touches ? e.touches[0].screenX : e.screenX) - startX,
					offsetP = 1 / chart.scale.offsetWidth * offsetX,
					width = startScaleOffset[1] - startScaleOffset[0],
					newOffset = [...startScaleOffset],
					maxOffset = [
						newOffset[1] - 0.03,
						newOffset[0] + 0.03,
					];

				if(!mode || mode < 0)
					newOffset[0] += offsetP;
				if(!mode || mode > 0)
					newOffset[1] += offsetP;
				if(newOffset[0] < 0) {
					newOffset[0] = 0;
					if(!mode)
						newOffset[1] = width;
				}
				if(newOffset[1] > 1) {
					newOffset[1] = 1;
					if(!mode)
						newOffset[0] = 1 - width;
				}
				if(mode < 0 && newOffset[0] > maxOffset[0])
					newOffset[0] = maxOffset[0];
				if(mode > 0 && newOffset[1] < maxOffset[1])
					newOffset[1] = maxOffset[1];
				chart.params.offset = newOffset;
				this.render(idx);
			})
			.on('touchend mouseup', document, e => {
				idx = false;
				document.body.style.cursor = "";
			});

		this.charts.forEach(chart => {
			chart.names.forEach(el =>
				this.on('click', el, e => {
					let el = e.srcElement.closest("[checked]"),
						idx = parseInt(el.closest("[idx]").getAttribute("idx")),
						checked = this.toggle(idx, el.getAttribute("name"));
					el.setAttribute("checked", checked);
				})
			);
			this.on('touchstart mousedown', chart.scaleZone, touchStart);
		});
	}

	on(events, el, fn) {
		events.split(" ").forEach(event =>
			el.addEventListener(event, fn, {passive: true})
		);
		return this;
	}

	q(selector, el = document) {
		return el.querySelector(selector);
	}

	qa(selector, el = document) {
		return el.querySelectorAll(selector);
	}

	async load(uri) {
		let response = await fetch(uri);
		this.data = await response.json();
		this.renderHtml();
		return this;
	}

	setMode(mode) {
		this.mode = mode;
		this.el.setAttribute("mode", mode);
		this.charts && this.charts.forEach((chart, idx) => this.render(idx));
		return this;
	}
}

const tpl = (chart, idx, prefix) => `
	<div class="${prefix}" idx="${idx}">
		<div class="${prefix}-title">Chart #${idx}</div>
		<div class="${prefix}-chart">
			<canvas></canvas>
		</div>
		<div class="${prefix}-scale">
			<canvas></canvas>
			<div class="${prefix}-scale-inactive"></div>
			<div class="${prefix}-scale-zone">
				<div></div>
				<div></div>
			</div>
			<div class="${prefix}-scale-inactive"></div>
		</div>
		<div class="${prefix}-legend">
			${Object.entries(chart.names).map((name, idx) => `
				<div checked="1" name="${name[0]}">
					<div><div style="border-color: ${chart.colors[name[0]]}"></div><div></div></div>
					${name[1]}
				</div>
			`).join('')}
		</div>
	</div>
`;

const style = prefix => `
	.${prefix} {
		margin: 0 auto;
		padding-bottom: 12px;
		background-color: #252f3e;
		}
		[mode=day] .${prefix} {
			background-color: #fff;
		}
		.${prefix} canvas {
			/*background: #ffffff22;*/
			position: absolute;
			width: 100%;
			height: 100%;
		}
		.${prefix}-title {
			padding-left: 16px;
			letter-spacing: 0.8px;
			font-weight: 500;
			color: #fff;
			}
			[mode=day] .${prefix}-title {
				color: #000;
			}
		.${prefix}-chart {
			position: relative;
			margin-bottom: 8px;
			height: 327px;
			}
			.${prefix}-chart:after {
				// content: '';
				position: absolute;
				display: block;
				top: 0;
				left: 0;
				right: 0;
				height: 20px;
				background: linear-gradient(to bottom, #252f3e 0%, #252f3e00 100%); 
				}
				[mode=day] .${prefix}-chart:after {
					background: linear-gradient(to bottom, rgba(255,255,255,1) 0%,rgba(255,255,255,0) 100%); 
				}
		.${prefix}-scale {
			position: relative;
			height: 40px;
			margin: 0 12px 15px;
			box-sizing: border-box;
			display: flex;
			}
			.${prefix}-scale-inactive {
				background: #202a38bd;
				z-index: 1;
				width: 20%;
				}
				[mode=day] .${prefix}-scale-inactive {
					background: #eef0f1b5;
				}
			.${prefix}-scale-zone {
				position: relative;
				border-right: 5px solid #7faad252;
			    border-left: 5px solid #7faad252;
			    border-top: 1px solid #7faad252;
			    border-bottom: 1px solid #7faad252;
				flex: 1;
				display: flex;
				justify-content: space-between;
				cursor: pointer;
				}
				.${prefix}-scale-zone div {
					position: relative;
					display: block;
					width: 5px;
					margin-left: -5px;
					cursor: w-resize;
					}
					.${prefix}-scale-zone div:after {
						z-index: 2;
						content: '';
						display: block;
						position: absolute;
						left: -5px;
						top: 0;
						right: 0;
						bottom: 0;
					}
				.${prefix}-scale-zone div:last-child {
					margin-right: -5px;
					cursor: e-resize;
					}
					.${prefix}-scale-zone div:last-child:after {
						left: 0;
						right: -5px;
					}
		.${prefix}-legend {
			display: flex;
			flex-wrap: wrap;
			padding: 0 5px;
			}
			.${prefix}-legend>div {
				position: relative;
				border: 1px solid #344658;
				height: 33px;
				border-radius: 50px;
				display: flex;
				align-items: center;
				padding: 0 14px 0 38px;
				font-size: 13px;
				color: #e8ecee;
				margin: 0 7px 14px;
				cursor: pointer;
				}
				[mode=day] .${prefix}-legend>div {
					color: #43484b;
					border-color: #e6ecf0;
				}
				.${prefix}-legend>div>div {
					width: 22px;
					height: 22px;
					position: absolute;
					top: 6px;
					left: 6px;
					}
					.${prefix}-legend>div>div>div {
						position: absolute;
						width: 100%;
						height: 100%;
						transition: all .3s;
					}
					.${prefix}-legend>div>div>div:first-child {
						border: 11px solid;
						border-radius: 50%;
						box-sizing: border-box;
						}
						.${prefix}-legend>div[checked="0"]>div>div:first-child {
							border-width: 2px;
							}
					.${prefix}-legend>div>div>div:last-child {
						background: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2ZXJzaW9uPSIxLjEiIGlkPSJDYXBhXzEiIHg9IjBweCIgeT0iMHB4IiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDQwNS4yNzIgNDA1LjI3MiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNDA1LjI3MiA0MDUuMjcyOyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+PGc+PGc+Cgk8cGF0aCBkPSJNMzkzLjQwMSwxMjQuNDI1TDE3OS42MDMsMzM4LjIwOGMtMTUuODMyLDE1LjgzNS00MS41MTQsMTUuODM1LTU3LjM2MSwwTDExLjg3OCwyMjcuODM2ICAgYy0xNS44MzgtMTUuODM1LTE1LjgzOC00MS41MiwwLTU3LjM1OGMxNS44NDEtMTUuODQxLDQxLjUyMS0xNS44NDEsNTcuMzU1LTAuMDA2bDgxLjY5OCw4MS42OTlMMzM2LjAzNyw2Ny4wNjQgICBjMTUuODQxLTE1Ljg0MSw0MS41MjMtMTUuODI5LDU3LjM1OCwwQzQwOS4yMyw4Mi45MDIsNDA5LjIzLDEwOC41NzgsMzkzLjQwMSwxMjQuNDI1eiIgZGF0YS1vcmlnaW5hbD0iIzAwMDAwMCIgY2xhc3M9ImFjdGl2ZS1wYXRoIiBzdHlsZT0iZmlsbDojRkZGRkZGIiBkYXRhLW9sZF9jb2xvcj0iIzAwMDAwMCI+PC9wYXRoPgo8L2c+PC9nPiA8L3N2Zz4=) center no-repeat;
						background-size: 13px;
						}
						.${prefix}-legend>div[checked="0"]>div>div:last-child {
							transform: scale(0);
						}
`;