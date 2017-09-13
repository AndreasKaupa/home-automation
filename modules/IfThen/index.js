/*** IfThen Z-Way HA module *******************************************

Version: 2.5.0
(c) Z-Wave.Me, 2017
-----------------------------------------------------------------------------
Author: Niels Roche <nir@zwave.eu>
Description:
	Bind actions on one device to other devices or scenes
******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function IfThen (id, controller) {
	// Call superconstructor first (AutomationModule)
	IfThen.super_.call(this, id, controller);
}

inherits(IfThen, AutomationModule);

_module = IfThen;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

IfThen.prototype.init = function (config) {
	IfThen.super_.prototype.init.call(this, config);

	var self = this,
		ifElement = self.config.sourceDevice[self.config.sourceDevice.filterIf];
	this.handlerLevel = function (sDev) {
		var that = self,
			operator = ifElement.operator,
			ifLevel = (ifElement.status === "level" && ifElement.level) || (!ifElement.status && ifElement.level) ? ifElement.level : ifElement.status,
			check = false,
			value = sDev.get("metrics:level");

		if (operator && ifLevel) {
			switch (operator) {
				case ">":
					check = value > ifLevel;
					break;
				case "=":
					check = value === ifLevel;
					break;
				case "<":
					check = value < ifLevel;
					break;
			}
		}

		if(check || value === ifLevel || sDev.get("deviceType") === "toggleButton"){
			self.config.targets.forEach(function(el) {
				var type = el.filterThen,
					id = el[type].target,
					lvl = el[type].status === "level" && el[type].level? el[type].level : (el[type].status === "color" && el[type].color? el[type].color: el[type].status),
					vDev = that.controller.devices.get(id),
					// compare old and new level
					compareValues = function(valOld,valNew){
						var vO = _.isNaN(parseFloat(valOld))? valOld : parseFloat(valOld),
							vN = _.isNaN(parseFloat(valNew))? valNew : parseFloat(valNew);

						return vO !== vN;
					},
					set = compareValues(vDev.get("metrics:level"), lvl);

				if (vDev) {
					if (!el[type].sendAction || (el[type].sendAction && set)) {
						if (vDev.get("deviceType") === type && (type === "switchMultilevel" || type === "thermostat" || type === "switchRGBW")) {
							if (lvl === "on" || lvl === "off"){
								vDev.performCommand(lvl);
							} else if (typeof lvl === "object") {
								vDev.performCommand("exact", lvl);
							} else {
								vDev.performCommand("exact", { level: lvl });
							}
						} else if (vDev.get("deviceType") === "toggleButton" && type === "scene") {
							vDev.performCommand("on");
						} else if (vDev.get("deviceType") === type) {
							vDev.performCommand(lvl);
						}
					}
				}
			});
		}
	};

	// Setup metric update event listener
	if(ifElement && ifElement.device){
		self.controller.devices.on(ifElement.device, "change:metrics:level", self.handlerLevel);
	}
};

IfThen.prototype.stop = function () {
	var self = this;
	
	// remove event listener
	self.controller.devices.off(self.config.sourceDevice[self.config.sourceDevice.filterIf].device,"change:metrics:level", self.handlerLevel);

	IfThen.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------
