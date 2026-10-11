/**
 * TripSplit — Expense Controller
 * Handles expense CRUD, multi-criteria filtering, equal split with fair paise remainder allocation,
 * custom split validation, and real-time live preview before saving.
 */

app.controller('ExpenseController', ['$scope', '$rootScope', 'apiService', function($scope, $rootScope, apiService) {
    $scope.expenses = [];
    $scope.loadingExpenses = false;
    $scope.totalFilteredExpenses = 0;

    // Filters model
    $scope.filters = {
        category: '',
        payer_id: '',
        search: '',
        start_date: '',
        end_date: ''
    };

    // Categories list
    $scope.categories = ['Food', 'Hotel', 'Transport', 'Shopping', 'Activities', 'Other'];

    // Modal expense form state
    $scope.isEditingExpense = false;
    $scope.expenseForm = {
        id: null,
        description: '',
        amount: '',
        category: 'Food',
        expense_date: new Date(),
        payer_member_id: '',
        split_type: 'equal',
        // Participants state: { [member_id]: { selected: boolean, custom_amount: number|string } }
        participantsMap: {}
    };

    // Split preview calculation object
    $scope.splitPreview = {
        totalAmountPaise: 0,
        participantCount: 0,
        shares: [],
        isValid: false,
        validationMessage: '',
        differenceRupees: 0
    };

    $scope.expenseToDelete = null;

    // Helper: get current trip ID reliably across nested scopes or URL
    $scope.getTripId = function() {
        if ($scope.currentTripId) return $scope.currentTripId;
        if ($scope.$parent && $scope.$parent.currentTripId) return $scope.$parent.currentTripId;
        if ($scope.$parent && $scope.$parent.selectedTrip) return $scope.$parent.selectedTrip;
        if ($rootScope.currentTripId) return $rootScope.currentTripId;
        const params = new URLSearchParams(window.location.search);
        const paramId = params.get('id') || params.get('trip_id');
        return paramId ? parseInt(paramId, 10) : null;
    };

    // Initialize/Refresh expenses
    $scope.loadExpenses = function() {
        const tripId = $scope.getTripId();
        if (!tripId) return;
        $scope.loadingExpenses = true;

        apiService.getExpenses(tripId, $scope.filters).then(function(res) {
            $scope.expenses = res.data.data || [];
            $scope.totalFilteredExpenses = $scope.expenses.reduce((sum, e) => sum + (e.amount_rupees || 0), 0);
            $scope.loadingExpenses = false;
        }).catch(function(err) {
            $scope.loadingExpenses = false;
            $rootScope.showToast('Failed to load expenses', 'danger');
        });
    };

    // Reset filters
    $scope.resetFilters = function() {
        $scope.filters = {
            category: '',
            payer_id: '',
            search: '',
            start_date: '',
            end_date: ''
        };
        $scope.loadExpenses();
    };

    // Open Add Expense Modal
    $scope.openAddExpenseModal = function() {
        $scope.isEditingExpense = false;
        const members = $scope.$parent.members || [];
        if (members.length === 0) {
            $rootScope.showToast('Please add members to the trip before adding expenses.', 'warning');
            return;
        }

        // Initialize participants map: select all by default
        const pMap = {};
        members.forEach(m => {
            pMap[m.id] = {
                selected: true,
                custom_amount: ''
            };
        });

        $scope.expenseForm = {
            id: null,
            description: '',
            amount: '',
            category: 'Food',
            expense_date: new Date(),
            payer_member_id: members[0].id.toString(),
            split_type: 'equal',
            participantsMap: pMap
        };

        $scope.calculateSplitPreview();

        const modalEl = document.getElementById('expenseModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // Open Edit Expense Modal
    $scope.openEditExpenseModal = function(expense) {
        $scope.isEditingExpense = true;
        const members = $scope.$parent.members || [];
        const pMap = {};

        // Prepopulate participants
        members.forEach(m => {
            pMap[m.id] = {
                selected: false,
                custom_amount: ''
            };
        });

        if (expense.shares && expense.shares.length > 0) {
            expense.shares.forEach(s => {
                if (pMap[s.member_id]) {
                    pMap[s.member_id].selected = true;
                    pMap[s.member_id].custom_amount = s.share_rupees;
                }
            });
        }

        $scope.expenseForm = {
            id: expense.id,
            description: expense.description,
            amount: expense.amount_rupees,
            category: expense.category,
            expense_date: expense.expense_date ? new Date(expense.expense_date + 'T00:00:00') : new Date(),
            payer_member_id: expense.payer_member_id.toString(),
            split_type: expense.split_type || 'equal',
            participantsMap: pMap
        };

        $scope.calculateSplitPreview();

        const modalEl = document.getElementById('expenseModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // Select/Deselect all participants
    $scope.toggleAllParticipants = function(selectAll) {
        angular.forEach($scope.expenseForm.participantsMap, function(item) {
            item.selected = selectAll;
        });
        $scope.calculateSplitPreview();
    };

    // Real-time calculation of expense split preview
    $scope.calculateSplitPreview = function() {
        const rawAmount = parseFloat($scope.expenseForm.amount) || 0;
        const totalPaise = Math.round(rawAmount * 100);
        const members = $scope.$parent.members || [];

        // Collect selected participants
        const selectedMembers = members.filter(m => {
            const p = $scope.expenseForm.participantsMap[m.id];
            return p && p.selected;
        });

        $scope.splitPreview.totalAmountPaise = totalPaise;
        $scope.splitPreview.participantCount = selectedMembers.length;
        $scope.splitPreview.shares = [];

        if (totalPaise <= 0) {
            $scope.splitPreview.isValid = false;
            $scope.splitPreview.validationMessage = 'Please enter a valid expense amount greater than ₹0';
            return;
        }

        if (selectedMembers.length === 0) {
            $scope.splitPreview.isValid = false;
            $scope.splitPreview.validationMessage = 'Select at least one member sharing this expense';
            return;
        }

        if ($scope.expenseForm.split_type === 'equal') {
            const n = selectedMembers.length;
            const basePaise = Math.floor(totalPaise / n);
            const remainderPaise = totalPaise % n;

            // Remainder paise fairly distributed to first `remainderPaise` members
            selectedMembers.forEach((m, idx) => {
                const memberPaise = basePaise + (idx < remainderPaise ? 1 : 0);
                $scope.splitPreview.shares.push({
                    member_id: m.id,
                    name: m.name,
                    share_paise: memberPaise,
                    share_rupees: memberPaise / 100,
                    hasRemainderPaisa: (idx < remainderPaise && remainderPaise > 0)
                });
            });

            $scope.splitPreview.isValid = true;
            if (remainderPaise > 0) {
                $scope.splitPreview.validationMessage = 'Equal split balanced perfectly (Remainder ' + remainderPaise + ' paisa distributed fairly).';
            } else {
                $scope.splitPreview.validationMessage = 'Equal split balanced perfectly.';
            }
        } else {
            // Custom Split
            let sumCustomPaise = 0;
            let allFilled = true;

            selectedMembers.forEach(m => {
                const userEntered = parseFloat($scope.expenseForm.participantsMap[m.id].custom_amount) || 0;
                const userPaise = Math.round(userEntered * 100);
                if (userPaise <= 0) {
                    allFilled = false;
                }
                sumCustomPaise += userPaise;
                $scope.splitPreview.shares.push({
                    member_id: m.id,
                    name: m.name,
                    share_paise: userPaise,
                    share_rupees: userPaise / 100
                });
            });

            const diffPaise = sumCustomPaise - totalPaise;
            $scope.splitPreview.differenceRupees = Math.abs(diffPaise) / 100;

            if (!allFilled) {
                $scope.splitPreview.isValid = false;
                $scope.splitPreview.validationMessage = 'All selected participants must have an assigned share greater than ₹0';
            } else if (diffPaise !== 0) {
                $scope.splitPreview.isValid = false;
                const status = diffPaise > 0 ? 'exceeds total by' : 'is short of total by';
                $scope.splitPreview.validationMessage = 'Custom shares sum (' + (sumCustomPaise / 100).toFixed(2) + ') ' + status + ' ₹' + $scope.splitPreview.differenceRupees.toFixed(2);
            } else {
                $scope.splitPreview.isValid = true;
                $scope.splitPreview.validationMessage = 'Custom shares match the total amount exactly!';
            }
        }
    };

    // Save Expense
    $scope.saveExpense = function() {
        $scope.calculateSplitPreview();

        if (!$scope.splitPreview.isValid) {
            $rootScope.showToast($scope.splitPreview.validationMessage || 'Please resolve split issues before saving', 'warning');
            return;
        }

        if (!$scope.expenseForm.description.trim()) {
            $rootScope.showToast('Expense description is required', 'warning');
            return;
        }

        if (!$scope.expenseForm.payer_member_id) {
            $rootScope.showToast('Please select who paid this expense', 'warning');
            return;
        }

        // Prepare participants payload
        let participantsPayload = [];
        if ($scope.expenseForm.split_type === 'equal') {
            participantsPayload = $scope.splitPreview.shares.map(s => s.member_id);
        } else {
            participantsPayload = $scope.splitPreview.shares.map(s => ({
                member_id: s.member_id,
                share_paise: s.share_paise
            }));
        }

        let expDateStr = $scope.expenseForm.expense_date;
        if (expDateStr instanceof Date) {
            expDateStr = expDateStr.getFullYear() + '-' + String(expDateStr.getMonth() + 1).padStart(2, '0') + '-' + String(expDateStr.getDate()).padStart(2, '0');
        }

        const payload = {
            id: $scope.expenseForm.id,
            trip_id: $scope.getTripId(),
            description: $scope.expenseForm.description.trim(),
            amount_paise: $scope.splitPreview.totalAmountPaise,
            category: $scope.expenseForm.category,
            expense_date: expDateStr,
            payer_member_id: parseInt($scope.expenseForm.payer_member_id, 10),
            split_type: $scope.expenseForm.split_type,
            participants: participantsPayload
        };

        const apiCall = $scope.isEditingExpense ? apiService.updateExpense(payload) : apiService.createExpense(payload);

        apiCall.then(function(res) {
            $rootScope.showToast($scope.isEditingExpense ? 'Expense updated successfully!' : 'Expense added successfully!', 'success');
            
            const modalEl = document.getElementById('expenseModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            $scope.loadExpenses();
            $scope.$emit('tripDataChanged');
        }).catch(function(err) {
            const msg = err.data && err.data.message ? err.data.message : 'Error saving expense';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Delete confirmation
    $scope.confirmDeleteExpense = function(expense) {
        $scope.expenseToDelete = expense;
        const modalEl = document.getElementById('deleteExpenseModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    $scope.executeDeleteExpense = function() {
        if (!$scope.expenseToDelete) return;

        apiService.deleteExpense($scope.expenseToDelete.id).then(function() {
            $rootScope.showToast('Expense deleted.', 'success');
            const modalEl = document.getElementById('deleteExpenseModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            $scope.expenseToDelete = null;
            $scope.loadExpenses();
            $scope.$emit('tripDataChanged');
        }).catch(function(err) {
            const msg = err.data && err.data.message ? err.data.message : 'Error deleting expense';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Events
    $scope.$on('refreshExpenses', function() {
        $scope.loadExpenses();
    });

    $scope.$on('membersUpdated', function() {
        $scope.loadExpenses();
    });

    // Initial load
    $scope.loadExpenses();
}]);
