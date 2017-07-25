/*** PhilioHW Z-Way HA module *******************************************

Version: 1.0.2
(c) Z-Wave.Me, 2016
-----------------------------------------------------------------------------
Author: Poltorak Serguei <ps@z-wave.me>
Description:
    Support for Philio hardware
******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function PhilioHW (id, controller) {
    // Call superconstructor first (AutomationModule)
    PhilioHW.super_.call(this, id, controller);
}

inherits(PhilioHW, AutomationModule);

_module = PhilioHW;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

PhilioHW.prototype.init = function (config) {
    PhilioHW.super_.prototype.init.call(this, config);

    this.ZWAY_DATA_CHANGE_TYPE = {   
        "Updated": 0x01,       // Value updated or child created
        "Invalidated": 0x02,   // Value invalidated             
        "Deleted": 0x03,       // Data holder deleted - callback is called last time before being deleted
        "ChildCreated": 0x04,  // New direct child node created                                          
                                                                                                         
        // ORed flags                                                                                    
        "PhantomUpdate": 0x40, // Data holder updated with same value (only updateTime changed)          
        "ChildEvent": 0x80     // Event from child node                                                  
    };

    var self = this;

    this.bindings = [];

    this.zwayReg = function (zwayName) {
        var zway = global.ZWave && global.ZWave[zwayName].zway;
        
        if (!zway) {
            return;
        }
       
        if (!zway.ZMEPHISetLED) {
            return;
        }

        self.zwayName = zwayName;
        self.bindings[zwayName] = [];

        if (zway.controller.data.philiohw) {
            self.registerButtons(zwayName);
        } else {
            self.controller.emit("ZWave.dataBind", self.bindings[zwayName], zwayName, "", function() {
                if (zway.controller.data.philiohw) {
                    self.controller.emit("ZWave.dataUnbind", self.bindings[zwayName]);
                    self.registerButtons(zwayName);
                }
            }, "");
            zway.ZMEPHIGetButton(1);
        }
    };
    
    this.zwayUnreg = function(zwayName) {
        self.controller.devices.remove("PhilioHW_" + self.id + "_" + zwayName + "_Tamper");
        if (!self.config.no_battery) {
            self.controller.devices.remove("PhilioHW_" + self.id + "_" + zwayName + "_PowerFailure");
            self.controller.devices.remove("PhilioHW_" + self.id + "_" + zwayName + "_BatteryLevel");
        }

        // detach handlers
        if (self.bindings[zwayName]) {
            self.controller.emit("ZWave.dataUnbind", self.bindings[zwayName]);
        }
        self.bindings[zwayName] = null;
    };
    
    this.controller.on("ZWave.register", this.zwayReg);
    this.controller.on("ZWave.unregister", this.zwayUnreg);

    // walk through existing ZWave
    if (global.ZWave) {
        for (var name in global.ZWave) {
            this.zwayReg(name);
        }
    }
    
    this.WPS_OFF = 0;
    this.WPS_REGISTRAR = 1;
    this.WPS_ENROLLEE = 2;
    this.WPS = this.WPS_OFF; // for LED indicator of WPS

    this.amINervous = false;
    // export function to show LED status with nervous blinks
    if (!PhilioHW.nervous) {
        PhilioHW.nervous = self.nervous;
    }
}

PhilioHW.prototype.stop = function () {
    var self = this;
    // unsign event handlers
    this.controller.off("ZWave.register", this.zwayReg);
    this.controller.off("ZWave.unregister", this.zwayUnreg);

    // detach handlers
    for (var name in this.bindings) {
        this.controller.emit("ZWave.dataUnbind", this.bindings[name]);
    }
    
    this.bindings = [];
    
    if (PhilioHW.nervous == self.nervous) {
        PhilioHW.nervous = undefined;
    }

    PhilioHW.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

PhilioHW.prototype.nervous = function(amINervous) {
    this.amINervous = amINervous;
    this.roundLED();
};

PhilioHW.prototype.roundLED = function() {
    var zwayName = this.zwayName;
    
    if (this.WPS === this.WPS_REGISTRAR) {
        global.ZWave[zwayName].zway.ZMEPHISetLED(0x11, 0x04); // LED steady On
    } else if (this.WPS === this.WPS_ENROLLEE) {
        global.ZWave[zwayName].zway.ZMEPHISetLED(0x11, 0x08); // Fast blink
    } else if (!this.config.no_battery && global.ZWave[zwayName].zway.controller.data.philiohw.powerFail.value) {
        global.ZWave[zwayName].zway.ZMEPHISetLED(0x11, 0x02); // LED off to save battery
    } else if (global.ZWave[zwayName].zway.controller.data.philiohw.tamper.state.value === 0) {
        global.ZWave[zwayName].zway.ZMEPHISetLED(0x11, 0x10); // Flashing LED
    } else if (this.amINervous) {
        // vice versa to idle (tamper.state = 2)
        if (!this.config.breath) {
            global.ZWave[zwayName].zway.ZMEPHISetLED(0x11, 0x20); // Breathing LED
        } else {
            global.ZWave[zwayName].zway.ZMEPHISetLED(0x11, 0x02); // LED off
        }
    } else if (global.ZWave[zwayName].zway.controller.data.philiohw.tamper.state.value === 2) {
        if (this.config.breath) {
            global.ZWave[zwayName].zway.ZMEPHISetLED(0x11, 0x20); // Breathing LED
        } else {
            global.ZWave[zwayName].zway.ZMEPHISetLED(0x11, 0x02); // LED off
        }
    }
}

PhilioHW.prototype.registerButtons = function(zwayName) {
    var self = this,
        langFile = this.loadModuleLang();

    // get current power state and buttons states
    if (!self.config.no_battery) {
        global.ZWave[zwayName].zway.ZMEPHIGetPower();
    } else {
        global.ZWave[zwayName].zway.controller.data.philiohw.powerFail.value = false;
        global.ZWave[zwayName].zway.controller.data.philiohw.batteryFail.value = false;
        global.ZWave[zwayName].zway.controller.data.philiohw.batteryLevel.value = 0;
    }
    global.ZWave[zwayName].zway.ZMEPHIGetButton(0);
    global.ZWave[zwayName].zway.ZMEPHIGetButton(1);
    global.ZWave[zwayName].zway.ZMEPHIGetButton(2);

    // Create vDev
    
    var tamperDev = this.controller.devices.create({
        deviceId: "PhilioHW_" + this.id + "_" + zwayName + "_Tamper",
        defaults: {
            deviceType: "sensorBinary",
            probeType: "alarm_burglar",
            metrics: {
                icon: "alarm",
                level: global.ZWave[zwayName].zway.controller.data.philiohw.tamper.state.value !== 2 ? "on" : "off",
                title: 'Controller Tamper'
            }
        },
        overlay: {},
        handler: function(command, args) {},
        moduleId: this.id
    });

    if (!self.config.no_battery) {
        var powerFailureDev = this.controller.devices.create({
            deviceId: "PhilioHW_" + this.id + "_" + zwayName + "_PowerFailure",
            defaults: {
                deviceType: "sensorBinary",
                probeType: "alarm_power",
                metrics: {
                    icon: "alarm",
                    level: global.ZWave[zwayName].zway.controller.data.philiohw.powerFail.value ? "on" : "off",
                    title: 'Controller Power Failure'
                }
            },
            overlay: {},
            handler: function(command, args) {},
            moduleId: this.id
        });

        var batteryLevelDev = this.controller.devices.create({
            deviceId: "PhilioHW_" + this.id + "_" + zwayName + "_BatteryLevel",
            defaults: {
                deviceType: "sensorMultilevel",
                probeType: "battery",
                metrics: {
                    scaleTitle: '%',
                    icon: "battery",
                    level: (global.ZWave[zwayName].zway.controller.data.philiohw.batteryLevel.value || 0) * 10,
                    title: 'Controller Backup Battery'
                }
            },
            overlay: {},
            handler: function(command, args) {},
            moduleId: this.id
        });
    }
        
    // Trap events
    
    this.controller.emit("ZWave.dataBind", self.bindings[zwayName], zwayName, "philiohw.tamper.state", function(type) {
        if (type === self.ZWAY_DATA_CHANGE_TYPE["Updated"]) {
            switch (this.value) {
                case 0:
                    self.addNotification("critical", langFile.tamper_triggered, "controller");
                    tamperDev.set("metrics:level", "on");
                    break;
                case 2:
                    self.addNotification("notification", langFile.tamper_idle, "controller");
                    tamperDev.set("metrics:level", "off");
                    break;
            }
        }
        self.roundLED();
    }, "");

    this.controller.emit("ZWave.dataBind", self.bindings[zwayName], zwayName, "philiohw.funcA.state", function(type) {
        switch (this.value) {
            case 3: // click
                self.WPS = self.WPS_REGISTRAR;
                self.roundLED();
                setTimeout(function() {
                    self.WPS = self.WPS_OFF;
                    self.roundLED();
                }, 30*1000);
                system("/lib/wifi-helper.sh WPSRegistrar");
                break;
            case 2: // hold
                self.WPS = self.WPS_ENROLLEE;
                self.roundLED();
                setTimeout(function() {
                    self.WPS = self.WPS_OFF;
                    self.roundLED();
                }, 30*1000);
                system("/lib/wifi-helper.sh WPS");
                break;
        }
    }, "");

    this.controller.emit("ZWave.dataBind", self.bindings[zwayName], zwayName, "philiohw.funcB.state", function(type) {
        switch (this.value) {
            case 3:
                if (global.ZWave[zwayName].zway.controller.data.controllerState.value === 0) {
                    global.ZWave[zwayName].zway.AddNodeToNetwork(true, true);
                } else if (global.ZWave[zwayName].zway.controller.data.controllerState.value === 1) {
                    global.ZWave[zwayName].zway.AddNodeToNetwork(false, false);
                }
                break;
            case 2:
                if (global.ZWave[zwayName].zway.controller.data.controllerState.value === 0) {
                    global.ZWave[zwayName].zway.RemoveNodeFromNetwork(true, true);
                } else if (global.ZWave[zwayName].zway.controller.data.controllerState.value === 5) {
                    global.ZWave[zwayName].zway.RemoveNodeFromNetwork(false, false);
                }
                break;
        }
    }, "");

    this.controller.emit("ZWave.dataBind", self.bindings[zwayName], zwayName, "controllerState", function(type) {
        if (this.value == 0) {
            global.ZWave[zwayName].zway.ZMEPHISetLED(0x10, 0x02); // idle
        } else if (this.value >= 1 && this.value <= 4) {
            global.ZWave[zwayName].zway.ZMEPHISetLED(0x10, 0x08); // including
        } else if (this.value >= 5 && this.value <= 7) {
            global.ZWave[zwayName].zway.ZMEPHISetLED(0x10, 0x10); // excluding
        } else {
            global.ZWave[zwayName].zway.ZMEPHISetLED(0x10, 0x20); // other
        }
    }, "");

    if (!self.config.no_battery) {
        this.controller.emit("ZWave.dataBind", self.bindings[zwayName], zwayName, "philiohw.batteryLevel", function(type) {
            if (type === self.ZWAY_DATA_CHANGE_TYPE["Updated"]) {
                self.addNotification("notification", langFile.remaining_battery_level + (this.value * 10) + "%", "controller");
                batteryLevelDev.set("metrics:level", (this.value * 10));
            }
        }, "");

        this.controller.emit("ZWave.dataBind", self.bindings[zwayName], zwayName, "philiohw.powerFail", function(type) {
            if (type === self.ZWAY_DATA_CHANGE_TYPE["Updated"]) {
                if (this.value) {
                    self.addNotification("critical", langFile.power_failure, "controller");
                    powerFailureDev.set("metrics:level", "on");
                    if (self.batteryTimer) clearInterval(self.batteryTimer);
                    self.batteryTimer = setInterval(function() {
                            global.ZWave[zwayName].zway.ZMEPHIGetPower();
                    }, 60*1000);
                } else {
                    self.addNotification("notification", langFile.power_recovery, "controller");
                    powerFailureDev.set("metrics:level", "off");
                    if (self.batteryTimer) clearInterval(self.batteryTimer);
                    self.batteryTimer = setInterval(function() {
                            global.ZWave[zwayName].zway.ZMEPHIGetPower();
                    }, 3600*1000);
                }
            }
            self.roundLED();
        }, "");

        this.controller.emit("ZWave.dataBind", self.bindings[zwayName], zwayName, "philiohw.batteryFail", function(type) {
            if (this.value) {
                self.addNotification("critical", langFile.battery_falure, "controller");
                batteryLevelDev.set("metrics:level", 0);
            }
        }, "");
    }
    
    // sync round LED with actual box status on start
    self.roundLED();
};
