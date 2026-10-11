/**
 * TripSplit — Main AngularJS Application Definition
 * Modules, filters, custom formatting, and global toast notification helpers
 */

const app = angular.module('tripSplitApp', []);

// Configuration
app.config(['$httpProvider', function($httpProvider) {
    // Ensure POST/PUT sends proper JSON headers
    $httpProvider.defaults.headers.common['Accept'] = 'application/json';
}]);

// Global Toast & Notification System
app.run(['$rootScope', '$timeout', function($rootScope, $timeout) {
    $rootScope.toast = {
        show: false,
        message: '',
        type: 'info', // 'success', 'danger', 'warning', 'info'
        icon: 'bi-info-circle-fill'
    };

    let toastTimeout = null;

    $rootScope.showToast = function(message, type = 'success') {
        const icons = {
            success: 'bi-check-circle-fill',
            danger: 'bi-exclamation-triangle-fill',
            warning: 'bi-exclamation-circle-fill',
            info: 'bi-info-circle-fill'
        };

        $rootScope.toast.message = message;
        $rootScope.toast.type = type;
        $rootScope.toast.icon = icons[type] || icons.info;
        $rootScope.toast.show = true;

        if (toastTimeout) {
            $timeout.cancel(toastTimeout);
        }

        toastTimeout = $timeout(function() {
            $rootScope.toast.show = false;
        }, 4500);
    };

    $rootScope.closeToast = function() {
        $rootScope.toast.show = false;
        if (toastTimeout) {
            $timeout.cancel(toastTimeout);
        }
    };
}]);

// Filter: Format float rupees to Indian Rupee standard format (e.g., ₹1,500.00)
app.filter('inr', function() {
    return function(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) {
            return '₹0.00';
        }
        const num = Number(amount);
        const isNegative = num < 0;
        const absVal = Math.abs(num);

        const parts = absVal.toFixed(2).split('.');
        let integerPart = parts[0];
        const decimalPart = parts[1];

        // Format according to Indian numbering system (thousands, lakhs, crores)
        let lastThree = integerPart.substring(integerPart.length - 3);
        const otherNumbers = integerPart.substring(0, integerPart.length - 3);
        if (otherNumbers !== '') {
            lastThree = ',' + lastThree;
        }
        const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

        return (isNegative ? '-₹' : '₹') + formattedInteger + '.' + decimalPart;
    };
});

// Filter: Convert integer paise directly into formatted Indian Rupees
app.filter('paiseToInr', ['$filter', function($filter) {
    return function(paise) {
        if (paise === null || paise === undefined || isNaN(paise)) {
            return '₹0.00';
        }
        const rupees = Number(paise) / 100;
        return $filter('inr')(rupees);
    };
}]);

// Filter: Format date string YYYY-MM-DD into a human-friendly format
app.filter('readableDate', function() {
    return function(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };
});
